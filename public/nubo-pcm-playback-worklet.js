class NuboPcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.queuedFrames = 0;
    this.started = false;
    this.wasActive = false;
    this.startThresholdFrames = 2880; // ~120 ms at 24 kHz; absorb mobile/network jitter.
    this.fadeFrames = 96; // ~4 ms at 24 kHz; short enough to be inaudible, long enough to de-click.
    this.fadeInRemaining = 0;
    this.lastSample = 0;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "clear") {
        this.queue = [];
        this.offset = 0;
        this.queuedFrames = 0;
        this.started = false;
        this.wasActive = false;
        this.fadeInRemaining = 0;
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

  process(_inputs, outputs) {
    const output = outputs?.[0]?.[0];
    if (!output) return true;
    output.fill(0);

    if (!this.started) {
      if (this.queuedFrames < this.startThresholdFrames) return true;
      this.started = true;
      this.fadeInRemaining = this.fadeFrames;
      this.lastSample = 0;
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

    // A restart after an underrun previously jumped directly from digital zero
    // to the first PCM sample. Ramp the first ~4 ms from silence to the stream.
    if (written > 0 && this.fadeInRemaining > 0) {
      const fadeCount = Math.min(written, this.fadeInRemaining);
      const fadeOffset = this.fadeFrames - this.fadeInRemaining;
      for (let i = 0; i < fadeCount; i += 1) {
        const gain = (fadeOffset + i + 1) / this.fadeFrames;
        output[i] *= Math.min(1, gain);
      }
      this.fadeInRemaining -= fadeCount;
    }

    if (written < output.length) {
      if (written === 0 && Math.abs(this.lastSample) > 0.0001) {
        // The queue can drain exactly at a render-quantum boundary. In that case
        // there are no samples in this block to fade, so bridge the previous
        // block's final sample down to zero instead of making a one-sample step.
        const fade = Math.min(output.length, this.fadeFrames);
        for (let i = 0; i < fade; i += 1) {
          output[i] = this.lastSample * (1 - (i + 1) / fade);
        }
      } else if (written > 0) {
        // Network underflow / true end of turn inside this render block.
        const fade = Math.min(written, this.fadeFrames);
        for (let i = 0; i < fade; i += 1) {
          const index = written - fade + i;
          output[index] *= 1 - (i + 1) / fade;
        }
      }

      this.started = false;
      this.fadeInRemaining = 0;
      if (this.wasActive) {
        this.wasActive = false;
        this.port.postMessage({ type: "drained" });
      }
    }

    this.lastSample = output[output.length - 1] || 0;
    return true;
  }
}

registerProcessor("nubo-pcm-stream", NuboPcmStreamProcessor);
