"use client";

import { useEffect } from "react";
import {
  createNuboVoiceAudioChain,
  type NuboVoiceAudioChain,
} from "@/lib/nubo-voice-audio-chain";
import {
  NUBO_VOICE_TUNING_EVENT,
  readNuboVoiceTuning,
  type NuboVoiceTuning,
} from "@/lib/nubo-voice-tuning";

type TunedAudioElement = HTMLAudioElement & {
  dataset: DOMStringMap & { nuboTuningAttached?: string };
};

export function NuboVoiceAudioTuningRuntime() {
  useEffect(() => {
    let chain: NuboVoiceAudioChain | null = null;
    let activeAudio: TunedAudioElement | null = null;
    let activeSourceStream: MediaStream | null = null;

    const dispose = async () => {
      const current = chain;
      chain = null;
      activeSourceStream = null;
      if (activeAudio) delete activeAudio.dataset.nuboTuningAttached;
      activeAudio = null;
      await current?.dispose();
    };

    const attach = (audio: TunedAudioElement, stream: MediaStream) => {
      if (activeAudio === audio && activeSourceStream === stream && chain) return;
      void dispose().then(() => {
        activeAudio = audio;
        activeSourceStream = stream;
        audio.dataset.nuboTuningAttached = "true";
        chain = createNuboVoiceAudioChain(stream, audio, readNuboVoiceTuning());
      });
    };

    const scan = () => {
      const candidates = Array.from(document.querySelectorAll("audio")) as TunedAudioElement[];
      const remoteAudio = candidates.find((audio) => {
        const stream = audio.srcObject;
        return (
          stream instanceof MediaStream &&
          stream.getAudioTracks().length > 0 &&
          audio.dataset.nuboTuningAttached !== "true"
        );
      });

      if (remoteAudio?.srcObject instanceof MediaStream) {
        attach(remoteAudio, remoteAudio.srcObject);
      }

      if (activeAudio && !document.contains(activeAudio)) {
        void dispose();
      }
    };

    const handleTuning = (event: Event) => {
      const tuning = (event as CustomEvent<NuboVoiceTuning>).detail;
      chain?.update(tuning ?? readNuboVoiceTuning());
    };

    const timer = window.setInterval(scan, 200);
    window.addEventListener(NUBO_VOICE_TUNING_EVENT, handleTuning);
    scan();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NUBO_VOICE_TUNING_EVENT, handleTuning);
      void dispose();
    };
  }, []);

  return null;
}
