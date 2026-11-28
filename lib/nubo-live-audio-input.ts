const SILENCE_BEFORE_STREAM_END_MS = 950;
const MAX_CONTINUOUS_CAPTURE_GAP_MS = 200;
const NEXT_SPEECH_PREROLL_FRAMES = 12;

/** Give automatic voice detection a fallback for an already active speech turn. */
export class NuboLiveAudioInput {
  private waitingForCloudEnd = false;
  private paused = false;
  private quietSince: number | null = null;
  private lastFrameAt: number | null = null;
  private lastSpeechAt: number | null = null;
  private readonly preroll: string[] = [];
  private readonly sendAudio: (pcm: string) => void;
  private readonly sendStreamEnd: () => void;

  constructor(sendAudio: (pcm: string) => void, sendStreamEnd: () => void) {
    this.sendAudio = sendAudio;
    this.sendStreamEnd = sendStreamEnd;
  }

  startCloudActivity() {
    this.waitingForCloudEnd = true;
    this.quietSince = null;
  }

  endCloudActivity() {
    this.waitingForCloudEnd = false;
    this.quietSince = null;
    const lastSpeechAt = this.lastSpeechAt;
    this.lastSpeechAt = null;
    return lastSpeechAt;
  }

  write(pcm: string, possibleSpeech = false) {
    const now = performance.now();
    const captureInterrupted = this.lastFrameAt === null ||
      now - this.lastFrameAt > MAX_CONTINUOUS_CAPTURE_GAP_MS;
    this.lastFrameAt = now;

    if (this.paused) {
      if (!possibleSpeech) {
        if (this.preroll.length === NEXT_SPEECH_PREROLL_FRAMES) this.preroll.shift();
        this.preroll.push(pcm);
        return;
      }
      this.paused = false;
      for (const frame of this.preroll) this.sendAudio(frame);
      this.preroll.length = 0;
    }

    this.sendAudio(pcm);
    if (possibleSpeech) {
      this.lastSpeechAt = now;
      this.quietSince = now;
      return;
    }
    if (!this.waitingForCloudEnd || this.lastSpeechAt === null) return;

    // Capture can deliver short frames in bursts. Use elapsed time while
    // frames continue to arrive, and restart the wait after a capture stall.
    if (captureInterrupted || this.quietSince === null) this.quietSince = now;
    if (now - this.quietSince >= SILENCE_BEFORE_STREAM_END_MS) {
      this.waitingForCloudEnd = false;
      this.paused = true;
      this.sendStreamEnd();
    }
  }
}
