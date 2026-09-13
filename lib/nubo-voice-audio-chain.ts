import type { NuboVoiceTuning } from "@/lib/nubo-voice-tuning";

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export type NuboVoiceAudioChain = {
  update: (tuning: NuboVoiceTuning) => void;
  dispose: () => Promise<void>;
};

export function createNuboVoiceAudioChain(
  stream: MediaStream,
  audio: SinkAudioElement,
  tuning: NuboVoiceTuning,
): NuboVoiceAudioChain {
  const context = new AudioContext({ latencyHint: "interactive" });
  const source = context.createMediaStreamSource(stream);
  const warmth = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const brightness = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();

  warmth.type = "lowshelf";
  warmth.frequency.value = 260;
  presence.type = "peaking";
  presence.frequency.value = 2600;
  presence.Q.value = 0.8;
  brightness.type = "highshelf";
  brightness.frequency.value = 5200;

  source
    .connect(warmth)
    .connect(presence)
    .connect(brightness)
    .connect(compressor)
    .connect(gain)
    .connect(destination);

  audio.srcObject = destination.stream;
  void audio.setSinkId?.("id-multimedia").catch(() => undefined);
  void context.resume().catch(() => undefined);
  void audio.play().catch(() => undefined);

  const update = (next: NuboVoiceTuning) => {
    const now = context.currentTime;
    warmth.gain.setTargetAtTime(next.warmth, now, 0.02);
    presence.gain.setTargetAtTime(next.presence, now, 0.02);
    brightness.gain.setTargetAtTime(next.brightness, now, 0.02);
    gain.gain.setTargetAtTime(next.outputGain, now, 0.02);

    const amount = next.compression / 100;
    compressor.threshold.setTargetAtTime(-8 - amount * 28, now, 0.02);
    compressor.knee.setTargetAtTime(8 + amount * 22, now, 0.02);
    compressor.ratio.setTargetAtTime(1 + amount * 5, now, 0.02);
    compressor.attack.setTargetAtTime(0.008, now, 0.02);
    compressor.release.setTargetAtTime(0.18, now, 0.02);
  };

  update(tuning);

  return {
    update,
    dispose: async () => {
      audio.pause();
      audio.srcObject = null;
      source.disconnect();
      warmth.disconnect();
      presence.disconnect();
      brightness.disconnect();
      compressor.disconnect();
      gain.disconnect();
      destination.disconnect();
      await context.close().catch(() => undefined);
    },
  };
}
