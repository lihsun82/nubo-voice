class NuboPcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.queuedFrames = 0;
    this.started = false;
    this.wasActive = false;
    this.startThresholdFrames = 960; // ~40 ms at 24 kHz

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "clear") {
        this.queue = [];
        this.offset = 0;
        this.queuedFrames = 0;
        this.started = false;
        this.wasActive = false;
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

  process(_inputs, outputs) {
    const output = outputs?.[0]?.[0];
    if (!output) return true;
    output.fill(0);

    if (!this.started) {
      if (this.queuedFrames < this.startThresholdFrames) return true;
      this.started = true;
    }

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

    if (written < output.length) {
      // Network underflow / true end of turn. Fade the tail to zero instead of
      // producing an abrupt sample discontinuity that becomes an audible click.
      const fade = Math.min(written, 64);
      for (let i = 0; i < fade; i += 1) {
        const index = written - fade + i;
        output[index] *= 1 - (i + 1) / fade;
      }

      this.started = false;
      if (this.wasActive) {
        this.wasActive = false;
        this.port.postMessage({ type: "drained" });
      }
    }

    return true;
  }
}

registerProcessor("nubo-pcm-stream", NuboPcmStreamProcessor);
