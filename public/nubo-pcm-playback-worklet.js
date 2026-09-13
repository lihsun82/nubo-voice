class NuboPcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.queuedFrames = 0;
    this.started = false;
    this.wasActive = false;

    // NUBO PCM DECLICK V2
    // Gemini Live PCM is 24 kHz. A little more jitter buffer is materially
    // cheaper than repeated underruns that turn sample discontinuities into
    // audible clicks/beeps on Android/WebView speakers.
    this.initialStartThresholdFrames = 1440; // ~60 ms @ 24 kHz
    this.restartThresholdFrames = 2880; // ~120 ms after an underrun
    this.startThresholdFrames = this.initialStartThresholdFrames;
    this.rampFrames = 128; // ~5.3 ms @ 24 kHz
    this.rampInRemaining = 0;
    this.lastSample = 0;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "clear") {
        this.queue = [];
        this.offset = 0;
        this.queuedFrames = 0;
        this.started = false;
        this.wasActive = false;
        this.startThresholdFrames = this.initialStartThresholdFrames;
        this.rampInRemaining = 0;
        this.lastSample = 0;
        return;
      }

      if (data.type !== "push") return;
      let samples = data.samples;
      if (samples instanceof ArrayBuffer) samples = new Float32Array(samples);
      if (!(samples instanceof Float32Array) || samples.length === 0) return;

      this.queue.push(samples);
      this.queuedFrames += samples.length;
      this.wasActive = true;
    };
  }

  beginStreamIfReady() {
    if (this.started) return true;
    if (this.queuedFrames < this.startThresholdFrames) return false;

    this.started = true;
    this.rampInRemaining = this.rampFrames;
    return true;
  }

  applyRampIn(output, written) {
    if (written <= 0 || this.rampInRemaining <= 0) return;

    const apply = Math.min(written, this.rampInRemaining);
    const alreadyApplied = this.rampFrames - this.rampInRemaining;
    for (let i = 0; i < apply; i += 1) {
      const gain = Math.min(1, (alreadyApplied + i + 1) / this.rampFrames);
      output[i] *= gain;
    }
    this.rampInRemaining -= apply;
  }

  fadeWrittenTailToZero(output, written) {
    if (written <= 0) return;
    const fade = Math.min(written, this.rampFrames);
    for (let i = 0; i < fade; i += 1) {
      const index = written - fade + i;
      output[index] *= 1 - (i + 1) / fade;
    }
  }

  emitLastSampleTail(output) {
    // If the previous render quantum ended exactly when the queue emptied,
    // there was no room in that quantum to fade out. Decay the last sample in
    // this quantum instead of jumping straight to digital zero.
    if (Math.abs(this.lastSample) < 0.000001) return;
    const fade = Math.min(output.length, this.rampFrames);
    for (let i = 0; i < fade; i += 1) {
      output[i] = this.lastSample * (1 - (i + 1) / fade);
    }
  }

  markDrained(reason) {
    this.started = false;
    this.rampInRemaining = 0;
    this.startThresholdFrames = this.restartThresholdFrames;
    this.lastSample = 0;

    if (this.wasActive) {
      this.wasActive = false;
      this.port.postMessage({ type: "drained", reason });
    }
  }

  process(_inputs, outputs) {
    const output = outputs?.[0]?.[0];
    if (!output) return true;
    output.fill(0);

    // A chunk may arrive between render quanta. If it did, continue the stream
    // without any stop/start boundary. If it did not, perform a real de-click
    // fade before entering buffered restart mode.
    if (this.started && this.queue.length === 0) {
      this.emitLastSampleTail(output);
      this.markDrained("boundary-underrun");
      return true;
    }

    if (!this.beginStreamIfReady()) return true;

    let written = 0;
    while (written < output.length && this.queue.length > 0) {
      const head = this.queue[0];
      const available = head.length - this.offset;
      const take = Math.min(available, output.length - written);
      output.set(head.subarray(this.offset, this.offset + take), written);
      written += take;
      this.offset += take;
      this.queuedFrames -= take;

      if (this.offset >= head.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }

    this.applyRampIn(output, written);

    if (written < output.length) {
      // Network underrun or true end-of-turn inside this render quantum.
      // Fade the actual PCM tail to zero before silence; never leave a hard
      // non-zero -> zero discontinuity for the speaker to reproduce as a beep.
      this.fadeWrittenTailToZero(output, written);
      this.markDrained("mid-quantum-underrun");
      return true;
    }

    this.lastSample = output[output.length - 1] || 0;
    this.startThresholdFrames = this.initialStartThresholdFrames;
    return true;
  }
}

registerProcessor("nubo-pcm-stream", NuboPcmStreamProcessor);
