import {
  disableHardwareOutputForCaptureContext,
  preferMultimediaAudioContext,
} from "@/lib/browser-speaker-output";

const NUBO_AUDIO_ECO_IDLE_MS = 60_000;
const NUBO_AUDIO_ECO_PREROLL_CHUNKS = 8;

let activePlaybackQueue: PcmPlaybackQueue | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downsample(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let total = 0;
    for (let j = start; j < end; j += 1) total += input[j];
    output[i] = total / Math.max(1, end - start);
  }
  return output;
}

function floatToPcm16(input: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function calculateRms(input: Float32Array) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    const value = input[i];
    sum += value * value;
  }
  return Math.sqrt(sum / Math.max(1, input.length));
}

function dispatchVoiceLevel(level: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("nubo:voice-level", {
      detail: { level: Math.max(0, Math.min(1, level)) },
    }),
  );
}

function addForegroundListeners(listener: () => void) {
  document.addEventListener("visibilitychange", listener, true);
  window.addEventListener("focus", listener, true);
  window.addEventListener("pageshow", listener, true);
}

function removeForegroundListeners(listener: () => void) {
  document.removeEventListener("visibilitychange", listener, true);
  window.removeEventListener("focus", listener, true);
  window.removeEventListener("pageshow", listener, true);
}

export class MicrophonePcmStream {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private foregroundListenersAttached = false;
  private lastVoiceAt = Date.now();
  private ecoSleeping = false;
  private noiseFloor = 0.012;
  private hotFrames = 0;
  private preRoll: string[] = [];

  private readonly handleForeground = () => {
    if (document.visibilityState === "visible") {
      this.ecoSleeping = false;
      this.lastVoiceAt = Date.now();
      this.preRoll = [];
      void this.resume();
    } else {
      this.ecoSleeping = true;
      this.preRoll = [];
    }
  };

  private attachForegroundListeners() {
    if (this.foregroundListenersAttached) return;
    addForegroundListeners(this.handleForeground);
    this.foregroundListenersAttached = true;
  }

  private detachForegroundListeners() {
    if (!this.foregroundListenersAttached) return;
    removeForegroundListeners(this.handleForeground);
    this.foregroundListenersAttached = false;
  }

  async start(onAudio: (base64: string) => void) {
    if (this.stream || this.context) {
      await this.stop();
    }

    this.lastVoiceAt = Date.now();
    this.ecoSleeping = false;
    this.noiseFloor = 0.012;
    this.hotFrames = 0;
    this.preRoll = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 16000 },
      },
    });

    this.context = new AudioContext({ latencyHint: "interactive" });
    await disableHardwareOutputForCaptureContext(this.context);
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);

    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.mute = this.context.createGain();
    this.captureDestination = this.context.createMediaStreamDestination();
    this.mute.gain.value = 0;

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const rms = calculateRms(input);
      const threshold = Math.max(0.02, this.noiseFloor * 2.6);
      const now = Date.now();

      if (rms < threshold * 0.8) {
        this.noiseFloor = this.noiseFloor * 0.985 + rms * 0.015;
      }

      if (rms >= threshold) this.hotFrames += 1;
      else this.hotFrames = Math.max(0, this.hotFrames - 1);

      const voiceDetected = this.hotFrames >= 2;
      if (voiceDetected) this.lastVoiceAt = now;

      const pcm = floatToPcm16(
        downsample(input, event.inputBuffer.sampleRate, 16000),
      );
      const base64 = toBase64(pcm);

      if (document.visibilityState !== "visible") {
        this.ecoSleeping = true;
        this.preRoll = [];
        return;
      }

      if (!this.ecoSleeping && now - this.lastVoiceAt >= NUBO_AUDIO_ECO_IDLE_MS) {
        this.ecoSleeping = true;
        this.preRoll = [];
      }

      if (this.ecoSleeping) {
        this.preRoll.push(base64);
        if (this.preRoll.length > NUBO_AUDIO_ECO_PREROLL_CHUNKS) {
          this.preRoll.shift();
        }

        if (!voiceDetected) return;

        this.ecoSleeping = false;
        this.lastVoiceAt = now;
        const buffered = this.preRoll;
        this.preRoll = [];
        for (const chunk of buffered) onAudio(chunk);
        return;
      }

      onAudio(base64);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.mute);
    this.mute.connect(this.captureDestination);
    this.attachForegroundListeners();
  }

  async resume() {
    if (!this.context || !this.stream) return false;

    for (const track of this.stream.getAudioTracks()) {
      track.enabled = true;
    }

    await disableHardwareOutputForCaptureContext(this.context);

    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }

    return this.context.state === "running";
  }

  async stop() {
    this.detachForegroundListeners();
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.captureDestination?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close().catch(() => undefined);
    this.stream = null;
    this.context = null;
    this.source = null;
    this.processor = null;
    this.mute = null;
    this.captureDestination = null;
    this.ecoSleeping = false;
    this.preRoll = [];
  }
}

export class PcmPlaybackQueue {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private readonly scheduleLeadSeconds = 0.08;
  private foregroundListenersAttached = false;
  private retired = false;

  constructor() {
    this.claimExclusiveOutput();
  }

  private claimExclusiveOutput() {
    if (activePlaybackQueue && activePlaybackQueue !== this) {
      activePlaybackQueue.retire();
    }
    activePlaybackQueue = this;
    this.retired = false;
  }

  private retire() {
    if (this.retired) return;
    this.retired = true;
    this.detachForegroundListeners();
    this.interrupt();
    const staleContext = this.context;
    this.context = null;
    if (staleContext) {
      void staleContext.close().catch(() => undefined);
    }
  }

  private readonly handleForeground = () => {
    if (document.visibilityState === "visible" && !this.retired) {
      void this.resume();
    }
  };

  private attachForegroundListeners() {
    if (this.foregroundListenersAttached || this.retired) return;
    addForegroundListeners(this.handleForeground);
    this.foregroundListenersAttached = true;
  }

  private detachForegroundListeners() {
    if (!this.foregroundListenersAttached) return;
    removeForegroundListeners(this.handleForeground);
    this.foregroundListenersAttached = false;
  }

  private async ensureContext() {
    if (this.retired) return null;

    if (activePlaybackQueue !== this) {
      this.claimExclusiveOutput();
    }

    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "playback" });
      this.attachForegroundListeners();
    }

    await preferMultimediaAudioContext(this.context);
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    return this.context;
  }

  async resume() {
    if (this.retired || !this.context) return false;
    await preferMultimediaAudioContext(this.context);
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    this.nextStart = Math.max(this.nextStart, this.context.currentTime);
    return this.context.state === "running";
  }

  async enqueue(base64: string, sampleRate = 24000) {
    if (this.retired) return;
    const context = await this.ensureContext();
    if (!context || this.retired || activePlaybackQueue !== this) return;

    const bytes = fromBase64(base64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (sampleCount <= 0) return;

    const audioBuffer = context.createBuffer(1, sampleCount, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      channel[i] = view.getInt16(i * 2, true) / 0x8000;
    }

    // Publish the actual NUBO output level so the hologram can brighten and
    // the N particle logo can pulse while speech audio is being scheduled.
    dispatchVoiceLevel(Math.min(1, calculateRms(channel) * 4.6));

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(
      context.currentTime + this.scheduleLeadSeconds,
      this.nextStart,
    );
    source.start(startAt);
    this.nextStart = startAt + audioBuffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0 && this.nextStart <= context.currentTime + 0.02) {
        dispatchVoiceLevel(0);
      }
    };
  }

  interrupt() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Ignore sources that have already ended.
      }
    }
    this.sources.clear();
    this.nextStart = this.context?.currentTime ?? 0;
    dispatchVoiceLevel(0);
  }

  async close() {
    this.detachForegroundListeners();
    this.interrupt();
    this.retired = true;
    if (activePlaybackQueue === this) activePlaybackQueue = null;
    const context = this.context;
    this.context = null;
    await context?.close().catch(() => undefined);
  }
}
