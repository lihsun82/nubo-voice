type SinkIdValue = string | { type: "none" };

type SinkSelectableAudioContext = AudioContext & {
  setSinkId?: (sinkId: SinkIdValue) => Promise<void>;
};

type SinkSelectableMediaElement = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const MULTIMEDIA_SINK_CANDIDATES = ["id-multimedia", "default", ""];

export async function preferMultimediaAudioContext(context: AudioContext) {
  const selectable = context as SinkSelectableAudioContext;
  if (typeof selectable.setSinkId !== "function") return false;

  for (const sinkId of MULTIMEDIA_SINK_CANDIDATES) {
    try {
      await selectable.setSinkId(sinkId);
      return true;
    } catch {
      // Try the next browser-supported multimedia/default sink alias.
    }
  }

  return false;
}

export async function preferMultimediaMediaElement(
  element: HTMLMediaElement,
) {
  const selectable = element as SinkSelectableMediaElement;
  if (typeof selectable.setSinkId !== "function") return false;

  for (const sinkId of MULTIMEDIA_SINK_CANDIDATES) {
    try {
      await selectable.setSinkId(sinkId);
      return true;
    } catch {
      // Try the next browser-supported multimedia/default sink alias.
    }
  }

  return false;
}

export async function disableHardwareOutputForCaptureContext(
  context: AudioContext,
) {
  const selectable = context as SinkSelectableAudioContext;
  if (typeof selectable.setSinkId !== "function") return false;

  try {
    await selectable.setSinkId({ type: "none" });
    return true;
  } catch {
    return false;
  }
}
