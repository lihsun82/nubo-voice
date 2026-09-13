"use client";

import { useEffect } from "react";
import {
  getNuboMicrophoneConstraints,
  getNuboNoiseProfileLabel,
  getNuboNoiseReductionType,
} from "@/lib/nubo-smart-noise";

function mergeAudioConstraints(
  requested: boolean | MediaTrackConstraints | undefined,
): boolean | MediaTrackConstraints {
  if (requested === false) return false;

  const smart = getNuboMicrophoneConstraints();
  const base =
    requested && typeof requested === "object" ? requested : {};

  return {
    ...base,
    ...smart,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
  };
}

export function NuboSmartNoiseRuntime() {
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) return;

    const nativeGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    const mode = getNuboNoiseReductionType();

    document.documentElement.dataset.nuboNoiseMode = mode;
    document.documentElement.dataset.nuboNoiseProfile = getNuboNoiseProfileLabel();

    const wrappedGetUserMedia = async (constraints?: MediaStreamConstraints) => {
      const next: MediaStreamConstraints = {
        ...(constraints ?? {}),
        audio: mergeAudioConstraints(constraints?.audio),
      };

      const stream = await nativeGetUserMedia(next);

      for (const track of stream.getAudioTracks()) {
        try {
          await track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 1 },
          });
        } catch {
          // Some Android/WebView audio tracks reject individual constraints even
          // though the same processing is already active from getUserMedia().
        }
      }

      return stream;
    };

    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: wrappedGetUserMedia,
    });

    window.dispatchEvent(
      new CustomEvent("nubo:smart-noise-ready", {
        detail: { mode, profile: getNuboNoiseProfileLabel() },
      }),
    );

    return () => {
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: nativeGetUserMedia,
      });
      delete document.documentElement.dataset.nuboNoiseMode;
      delete document.documentElement.dataset.nuboNoiseProfile;
    };
  }, []);

  return null;
}
