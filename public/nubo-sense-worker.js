const MEDIAPIPE_VERSION = "1.0.1";
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/wasm`;
const MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MEDIAPIPE_VERSION}/+esm`;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite";

let classifierPromise = null;
const candidateStates = new Map();

const rules = {
  cough: { minScore: 0.18, cooldownMs: 15000 },
  sneeze: { minScore: 0.20, cooldownMs: 20000 },
  yawn: { minScore: 0.16, cooldownMs: 30000 },
  breathing: { minScore: 0.20, cooldownMs: 25000 },
  scream: { minScore: 0.22, cooldownMs: 10000 },
  laughter: { minScore: 0.18, cooldownMs: 15000 },
  crying: { minScore: 0.22, cooldownMs: 25000 },
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
    return { ...base, minScore: 0.26 };
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
      source: "web-yamnet",
    },
  });
}

async function ensureClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const module = await import(MODULE_URL);
      const fileset = await module.FilesetResolver.forAudioTasks(WASM_ROOT);
      return module.AudioClassifier.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU",
        },
        maxResults: 30,
        scoreThreshold: 0.05,
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
      self.postMessage({ type: "ready" });
      return;
    }
    if (data.type === "classify" && data.audioBuffer) {
      await classify(data.audioBuffer, data.sampleRate);
      self.postMessage({ type: "classified" });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: String(error?.message || error || "NUBO Sense worker error").slice(0, 220),
    });
  }
};
