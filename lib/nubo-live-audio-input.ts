const SILENCE_BEFORE_STREAM_END_MS = 950;
const NEXT_SPEECH_PREROLL_FRAMES = 12;

/** Give automatic voice detection a fallback for an already active speech turn. */
export class NuboLiveAudioInput {
  private waitingForCloudEnd = false;
  private paused = false;
  private silenceMs = 0;
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
    this.silenceMs = 0;
  }

  endCloudActivity() {
    this.waitingForCloudEnd = false;
    this.silenceMs = 0;
    const lastSpeechAt = this.lastSpeechAt;
    this.lastSpeechAt = null;
    return lastSpeechAt;
  }

  write(pcm: string, possibleSpeech = false, durationMs = 0) {
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
      this.lastSpeechAt = performance.now();
      this.silenceMs = 0;
      return;
    }
    if (!this.waitingForCloudEnd || this.lastSpeechAt === null) return;

    // Only time captured silence. A stalled or backgrounded microphone
    // contributes no audio frames and cannot cut off a guest.
    this.silenceMs += durationMs;
    if (this.silenceMs >= SILENCE_BEFORE_STREAM_END_MS) {
      this.waitingForCloudEnd = false;
      this.paused = true;
      this.sendStreamEnd();
    }
  }
}
