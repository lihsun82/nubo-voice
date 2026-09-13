type SinkIdValue = string | { type: "none" };

type SinkSelectableAudioContext = AudioContext & {
  setSinkId?: (sinkId: SinkIdValue) => Promise<void>;
};

type SinkSelectableMediaElement = HTMLMediaElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const MULTIMEDIA_SINK_CANDIDATES = ["id-multimedia", "default", ""];

const audioContextSinkCache = new WeakMap<AudioContext, boolean>();
const captureContextSinkCache = new WeakMap<AudioContext, boolean>();
const mediaElementSinkCache = new WeakMap<HTMLMediaElement, boolean>();

async function setAudioContextSinkOnce(
  context: AudioContext,
  cache: WeakMap<AudioContext, boolean>,
  sinkIds: SinkIdValue[],
) {
  if (cache.has(context)) return cache.get(context) === true;

  const selectable = context as SinkSelectableAudioContext;
  if (typeof selectable.setSinkId !== "function") {
    cache.set(context, false);
    return false;
  }

  for (const sinkId of sinkIds) {
    try {
      await selectable.setSinkId(sinkId);
      cache.set(context, true);
      return true;
    } catch {
      // Try the next browser-supported sink alias once for this AudioContext.
    }
  }

  cache.set(context, false);
  return false;
}

export async function preferMultimediaAudioContext(context: AudioContext) {
  return setAudioContextSinkOnce(
    context,
    audioContextSinkCache,
    MULTIMEDIA_SINK_CANDIDATES,
  );
}

export async function preferMultimediaMediaElement(
  element: HTMLMediaElement,
) {
  if (mediaElementSinkCache.has(element)) {
    return mediaElementSinkCache.get(element) === true;
  }

  const selectable = element as SinkSelectableMediaElement;
  if (typeof selectable.setSinkId !== "function") {
    mediaElementSinkCache.set(element, false);
    return false;
  }

  for (const sinkId of MULTIMEDIA_SINK_CANDIDATES) {
    try {
      await selectable.setSinkId(String(sinkId));
      mediaElementSinkCache.set(element, true);
      return true;
    } catch {
      // Try the next browser-supported multimedia/default sink alias once.
    }
  }

  mediaElementSinkCache.set(element, false);
  return false;
}

export async function disableHardwareOutputForCaptureContext(
  context: AudioContext,
) {
  return setAudioContextSinkOnce(context, captureContextSinkCache, [{ type: "none" }]);
}
