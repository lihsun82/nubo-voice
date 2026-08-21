import {
  AudioClassifier,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@1.0.1/audio_bundle.mjs";

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite";

let classifierPromise = null;
const candidateStates = new Map();

// Slightly more sensitive than the first Web build. Android keeps its own
// thresholds; these are only for pure Web NUBO where browser audio processing
// can attenuate short non-speech transients.
const rules = {
  cough: { minScore: 0.13, cooldownMs: 12000 },
  sneeze: { minScore: 0.15, cooldownMs: 15000 },
  yawn: { minScore: 0.13, cooldownMs: 22000 },
  breathing: { minScore: 0.14, cooldownMs: 18000 },
  scream: { minScore: 0.19, cooldownMs: 9000 },
  laughter: { minScore: 0.14, cooldownMs: 12000 },
  crying: { minScore: 0.19, cooldownMs: 18000 },
};

function mapLabelToEventType(rawLabel) {
  const label = String(rawLabel || "").toLowerCase();
  if (label.includes("cough") || label.includes("throat clearing")) return "cough";
  if (label.includes("sneeze")) return "sneeze";
  if (label.includes("yawn")) return "yawn";
  if (
    label.includes("breathing") ||
    label.includes("pant") ||
    label.includes("wheeze") ||
    label.includes("sigh") ||
    label.includes("gasp")
  ) return "breathing";
  if (
    label.includes("scream") ||
    label.includes("shout") ||
    label.includes("yell") ||
    label.includes("bellow") ||
    label.includes("whoop")
  ) return "scream";
  if (
    label.includes("laughter") ||
    label.includes("giggle") ||
    label.includes("snicker") ||
    label.includes("belly laugh") ||
    label.includes("chuckle") ||
    label.includes("chortle")
  ) return "laughter";
  if (
    label.includes("crying") ||
    label.includes("sobbing") ||
    label.includes("whimper") ||
    label.includes("wail") ||
    label.includes("baby cry") ||
    label.includes("infant cry")
  ) return "crying";
  return null;
}

function ruleFor(type, rawLabel) {
  const base = rules[type];
  if (!base) return null;
  if (type === "breathing" && String(rawLabel || "").toLowerCase().includes("gasp")) {
    return { ...base, minScore: 0.20 };
  }
  return base;
}

function considerDetection(type, rawLabel, score) {
  const rule = ruleFor(type, rawLabel);
  if (!rule || score < rule.minScore) return;
  const now = Date.now();
  const previous = candidateStates.get(type) || { lastTriggeredMs: 0 };
  if (now - previous.lastTriggeredMs < rule.cooldownMs) return;
  previous.lastTriggeredMs = now;
  candidateStates.set(type, previous);
  self.postMessage({
    type: "event",
    event: {
      type,
      label: rawLabel,
      confidence: score,
      timestampMs: now,
      source: "web-yamnet-v2",
    },
  });
}

async function ensureClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const fileset = await FilesetResolver.forAudioTasks(WASM_ROOT);
      return AudioClassifier.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
        },
        // Keep many candidates from YAMNet, then apply NUBO's own event
        // thresholds below. The old top-30 cap could hide quieter sigh/yawn
        // classes behind speech/background categories.
        maxResults: 100,
        scoreThreshold: 0.02,
      });
    })().catch((error) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

async function classify(audioBuffer, sampleRate) {
  const classifier = await ensureClassifier();
  const audioData = new Float32Array(audioBuffer);
  const results = classifier.classify(audioData, sampleRate || 16000);
  const bestByType = new Map();

  for (const result of Array.isArray(results) ? results : []) {
    for (const classifications of result?.classifications || []) {
      for (const category of classifications?.categories || []) {
        const rawLabel = String(category?.categoryName || "");
        const eventType = mapLabelToEventType(rawLabel);
        const score = Number(category?.score || 0);
        if (!eventType || !Number.isFinite(score)) continue;
        const current = bestByType.get(eventType);
        if (!current || score > current.score) {
          bestByType.set(eventType, { rawLabel, score });
        }
      }
    }
  }

  for (const [type, match] of bestByType.entries()) {
    considerDetection(type, match.rawLabel, match.score);
  }
}

self.onmessage = async (message) => {
  const data = message.data || {};
  try {
    if (data.type === "init") {
      await ensureClassifier();
      self.postMessage({ type: "ready", source: "web-yamnet-v2" });
      return;
    }
    if (data.type === "classify" && data.audioBuffer) {
      await classify(data.audioBuffer, data.sampleRate);
      self.postMessage({ type: "classified" });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: String(error?.message || error || "NUBO Sense worker error").slice(0, 260),
    });
  }
};
