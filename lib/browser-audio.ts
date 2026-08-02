import {
  disableHardwareOutputForCaptureContext,
  preferMultimediaAudioContext,
} from "@/lib/browser-speaker-output";

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

  private readonly handleForeground = () => {
    if (document.visibilityState === "visible") {
      void this.resume();
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

    /*
     * The microphone graph is capture-only. On Android, connecting its silent
     * tail to context.destination can keep Chrome in communication/call output
     * mode and route unrelated music to the earpiece. Prefer a no-output sink
     * when supported and always terminate the graph at a virtual MediaStream
     * destination rather than the phone hardware output.
     */
    await disableHardwareOutputForCaptureContext(this.context);
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);

    /*
     * 2048在常見48kHz裝置約43ms，符合即時語音的小音訊區塊，
     * 同時避免手機累積一秒後才傳送造成明顯延遲。
     */
    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.mute = this.context.createGain();
    this.captureDestination = this.context.createMediaStreamDestination();
    this.mute.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = floatToPcm16(
        downsample(input, event.inputBuffer.sampleRate, 16000),
      );
      onAudio(toBase64(pcm));
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
  }
}

export class PcmPlaybackQueue {
  private context: AudioContext | null = null;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private readonly scheduleLeadSeconds = 0.08;
  private foregroundListenersAttached = false;

  private readonly handleForeground = () => {
    if (document.visibilityState === "visible") {
      void this.resume();
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

  private async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "playback" });
      this.attachForegroundListeners();
    }

    await preferMultimediaAudioContext(this.context);
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  async resume() {
    if (!this.context) return false;
    await preferMultimediaAudioContext(this.context);
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    this.nextStart = Math.max(this.nextStart, this.context.currentTime);
    return this.context.state === "running";
  }

  async enqueue(base64: string, sampleRate = 24000) {
    const context = await this.ensureContext();
    const bytes = fromBase64(base64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const audioBuffer = context.createBuffer(1, sampleCount, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      channel[i] = view.getInt16(i * 2, true) / 0x8000;
    }
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
    source.onended = () => this.sources.delete(source);
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
  }

  async close() {
    this.detachForegroundListeners();
    this.interrupt();
    await this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
