"use client";

const ECO_IDLE_MS = 60_000;
const ECO_WAKE_PROBE_MS = 8_000;
const ECO_POLL_MS = 70;

export type NuboEcoMode = "active" | "sleeping";

export class NuboRealtimeEcoGate {
  private sender: RTCRtpSender | null = null;
  private sendTrack: MediaStreamTrack | null = null;
  private monitorTrack: MediaStreamTrack | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mute: GainNode | null = null;
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private timer: number | null = null;
  private lastActivityAt = Date.now();
  private probeUntil = 0;
  private noiseFloor = 0.012;
  private hotFrames = 0;
  private sleeping = false;
  private destroyed = false;

  constructor(private readonly onModeChange?: (mode: NuboEcoMode) => void) {}

  async attach(peer: RTCPeerConnection, stream: MediaStream) {
    const track = stream.getAudioTracks()[0] ?? null;
    if (!track) throw new Error("找不到麥克風音訊軌");

    this.sendTrack = track;
    this.sender = peer.addTrack(track, stream);
    this.monitorTrack = track.clone();

    try {
      this.context = new AudioContext({ latencyHint: "interactive" });
      const monitorStream = new MediaStream([this.monitorTrack]);
      this.source = this.context.createMediaStreamSource(monitorStream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.55;
      this.mute = this.context.createGain();
      this.captureDestination = this.context.createMediaStreamDestination();
      this.mute.gain.value = 0;
      this.source.connect(this.analyser);
      this.analyser.connect(this.mute);
      this.mute.connect(this.captureDestination);
      await this.context.resume().catch(() => undefined);
    } catch {
      await this.closeMonitorGraph();
    }

    document.addEventListener("visibilitychange", this.handleVisibility, true);
    window.addEventListener("pagehide", this.handlePageHide, true);
    window.addEventListener("pageshow", this.handlePageShow, true);
    window.addEventListener("nubo:native-background", this.handleNativeBackground, true);
    window.addEventListener("nubo:native-foreground", this.handleNativeForeground, true);

    this.timer = window.setInterval(() => {
      void this.tick();
    }, ECO_POLL_MS);
  }

  noteActivity() {
    this.lastActivityAt = Date.now();
    this.probeUntil = 0;
    if (this.sleeping && document.visibilityState === "visible") {
      void this.resume("activity");
    }
  }

  private readonly handleVisibility = () => {
    if (document.visibilityState === "hidden") {
      void this.suspend("background");
    } else {
      this.probeUntil = Date.now() + ECO_WAKE_PROBE_MS;
      void this.resume("foreground");
    }
  };

  private readonly handlePageHide = () => {
    void this.suspend("pagehide");
  };

  private readonly handlePageShow = () => {
    this.probeUntil = Date.now() + ECO_WAKE_PROBE_MS;
    void this.resume("pageshow");
  };

  private readonly handleNativeBackground = () => {
    void this.suspend("native-background");
  };

  private readonly handleNativeForeground = () => {
    this.probeUntil = Date.now() + ECO_WAKE_PROBE_MS;
    void this.resume("native-foreground");
  };

  private async tick() {
    if (this.destroyed || document.visibilityState !== "visible") return;

    const now = Date.now();

    if (!this.sleeping) {
      if (now > this.probeUntil && now - this.lastActivityAt >= ECO_IDLE_MS) {
        await this.suspend("idle");
      }
      return;
    }

    const analyser = this.analyser;
    if (!analyser) return;

    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const value = samples[i];
      sum += value * value;
    }
    const rms = Math.sqrt(sum / Math.max(1, samples.length));

    const threshold = Math.max(0.026, this.noiseFloor * 2.8);
    if (rms < threshold * 0.8) {
      this.noiseFloor = this.noiseFloor * 0.985 + rms * 0.015;
    }

    if (rms >= threshold) this.hotFrames += 1;
    else this.hotFrames = Math.max(0, this.hotFrames - 1);

    if (this.hotFrames >= 2) {
      this.hotFrames = 0;
      this.probeUntil = now + ECO_WAKE_PROBE_MS;
      await this.resume("local-voice");
    }
  }

  private async suspend(_reason: string) {
    if (this.destroyed || this.sleeping) return;
    const sender = this.sender;
    if (!sender) return;

    try {
      await sender.replaceTrack(null);
      this.sleeping = true;
      this.onModeChange?.("sleeping");
    } catch {
      // Keep the active session if this browser rejects replaceTrack(null).
    }
  }

  private async resume(reason: string) {
    if (this.destroyed || !this.sleeping) return;
    if (
      document.visibilityState !== "visible" &&
      reason !== "native-foreground"
    ) {
      return;
    }

    const sender = this.sender;
    const track = this.sendTrack;
    if (!sender || !track || track.readyState !== "live") return;

    try {
      await sender.replaceTrack(track);
      this.sleeping = false;
      if (reason !== "local-voice") this.lastActivityAt = Date.now();
      this.onModeChange?.("active");
    } catch {
      // Keep eco mode if the sender cannot be resumed.
    }
  }

  private async closeMonitorGraph() {
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.mute?.disconnect();
    this.captureDestination?.disconnect();
    this.monitorTrack?.stop();
    await this.context?.close().catch(() => undefined);
    this.source = null;
    this.analyser = null;
    this.mute = null;
    this.captureDestination = null;
    this.monitorTrack = null;
    this.context = null;
  }

  async destroy() {
    this.destroyed = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener("visibilitychange", this.handleVisibility, true);
    window.removeEventListener("pagehide", this.handlePageHide, true);
    window.removeEventListener("pageshow", this.handlePageShow, true);
    window.removeEventListener("nubo:native-background", this.handleNativeBackground, true);
    window.removeEventListener("nubo:native-foreground", this.handleNativeForeground, true);
    await this.closeMonitorGraph();
    this.sender = null;
    this.sendTrack = null;
  }
}
