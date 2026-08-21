import fs from 'node:fs';

const audioPath = 'lib/browser-audio.ts';
let audio = fs.readFileSync(audioPath, 'utf8');
const marker = 'NUBO_WEB_SENSE_YAMNET_V2';

if (!audio.includes(marker)) {
  if (!audio.includes('NUBO_WEB_SENSE_YAMNET_V1')) {
    throw new Error('web sense v2 requires Web Sense V1 to run first');
  }

  audio = audio.replace(
    '// NUBO_WEB_SENSE_YAMNET_V1',
    '// NUBO_WEB_SENSE_YAMNET_V1\n// NUBO_WEB_SENSE_YAMNET_V2',
  );

  const declarationsAnchor = `let webSenseBusy = false;\nlet webSensePlaybackActive = false;\nlet webSenseDisabledUntil = 0;\nconst NUBO_WEB_SENSE_FRAME_BYTES = 31_200; // YAMNet 0.975 s at PCM16/16 kHz.`;
  const declarationsReplacement = `let webSenseBusy = false;\nlet webSenseReady = false;\nlet webSenseInitTimer: number | null = null;\nlet webSensePlaybackActive = false;\nlet webSenseDisabledUntil = 0;\nconst NUBO_WEB_SENSE_FRAME_BYTES = 31_200; // YAMNet 0.975 s at PCM16/16 kHz.\nconst NUBO_WEB_SENSE_HOP_BYTES = 15_600; // 50% overlap catches short cough/sneeze transients.`;
  if (!audio.includes(declarationsAnchor)) {
    throw new Error('web sense v2 declarations anchor missing');
  }
  audio = audio.replace(declarationsAnchor, declarationsReplacement);

  const disablePattern = /function disableWebSenseTemporarily\(\) \{[\s\S]*?\n\}/;
  const disableReplacement = `function disableWebSenseTemporarily() {\n  webSenseDisabledUntil = Date.now() + 5_000;\n  webSenseBusy = false;\n  webSenseReady = false;\n  resetWebSenseBuffer();\n  if (webSenseInitTimer !== null) {\n    window.clearTimeout(webSenseInitTimer);\n    webSenseInitTimer = null;\n  }\n  if (webSenseWorker) {\n    try { webSenseWorker.terminate(); } catch {}\n    webSenseWorker = null;\n  }\n}`;
  if (!disablePattern.test(audio)) throw new Error('web sense v2 disable function missing');
  audio = audio.replace(disablePattern, disableReplacement);

  const runtimePattern = /function ensureWebSenseWorker\(\) \{[\s\S]*?\n\}\n\nfunction forwardPcmToWebSense\(pcm: Uint8Array\) \{[\s\S]*?\n\}\n\nfunction fromBase64/;
  const runtimeReplacement = `function ensureWebSenseWorker() {\n  if (typeof window === \"undefined\" || hasNativeSenseBridge()) return null;\n  if (Date.now() < webSenseDisabledUntil) return null;\n  if (webSenseWorker) return webSenseWorker;\n\n  try {\n    const worker = new Worker(\"/nubo-sense-worker.js\", { type: \"module\" });\n    webSenseWorker = worker;\n    webSenseReady = false;\n    webSenseBusy = false;\n\n    if (webSenseInitTimer !== null) window.clearTimeout(webSenseInitTimer);\n    webSenseInitTimer = window.setTimeout(() => {\n      if (webSenseWorker === worker && !webSenseReady) disableWebSenseTemporarily();\n    }, 12_000);\n\n    worker.onmessage = (message: MessageEvent) => {\n      const data = message.data as {\n        type?: string;\n        event?: {\n          type?: string;\n          label?: string;\n          confidence?: number;\n          timestampMs?: number;\n          source?: string;\n        };\n      };\n      if (data?.type === \"ready\") {\n        webSenseReady = true;\n        if (webSenseInitTimer !== null) {\n          window.clearTimeout(webSenseInitTimer);\n          webSenseInitTimer = null;\n        }\n        window.dispatchEvent(new CustomEvent(\"nubo:sense-ready\", { detail: { source: \"web-yamnet-v2\" } }));\n        return;\n      }\n      if (data?.type === \"classified\") {\n        webSenseBusy = false;\n        return;\n      }\n      if (data?.type === \"event\" && data.event?.type) {\n        window.dispatchEvent(new CustomEvent(\"nubo:sense-event\", { detail: data.event }));\n        return;\n      }\n      if (data?.type === \"error\") disableWebSenseTemporarily();\n    };\n    worker.onerror = () => disableWebSenseTemporarily();\n    worker.postMessage({ type: \"init\" });\n    return worker;\n  } catch {\n    disableWebSenseTemporarily();\n    return null;\n  }\n}\n\nfunction forwardPcmToWebSense(pcm: Uint8Array) {\n  if (typeof window === \"undefined\" || hasNativeSenseBridge()) return;\n  if (webSensePlaybackActive) {\n    resetWebSenseBuffer();\n    return;\n  }\n\n  const worker = ensureWebSenseWorker();\n  if (!worker) return;\n\n  // Always buffer audio while the model is loading or classifying. V1 discarded\n  // all microphone chunks during inference, which created blind spots.\n  webSenseChunks.push(pcm.slice());\n  webSenseBytes += pcm.length;\n  if (!webSenseReady || webSenseBusy || webSenseBytes < NUBO_WEB_SENSE_FRAME_BYTES) return;\n\n  const merged = new Uint8Array(webSenseBytes);\n  let offset = 0;\n  for (const chunk of webSenseChunks) {\n    merged.set(chunk, offset);\n    offset += chunk.length;\n  }\n\n  const frame = merged.slice(0, NUBO_WEB_SENSE_FRAME_BYTES);\n  // Advance only half a YAMNet window so a short transient cannot disappear at\n  // the boundary between two non-overlapping frames.\n  const retained = merged.slice(Math.min(NUBO_WEB_SENSE_HOP_BYTES, merged.length));\n  webSenseChunks = retained.length ? [retained] : [];\n  webSenseBytes = retained.length;\n\n  const sampleCount = Math.floor(frame.byteLength / 2);\n  const floatSamples = new Float32Array(sampleCount);\n  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);\n  for (let i = 0; i < sampleCount; i += 1) {\n    floatSamples[i] = view.getInt16(i * 2, true) / 0x8000;\n  }\n\n  webSenseBusy = true;\n  try {\n    worker.postMessage(\n      { type: \"classify\", audioBuffer: floatSamples.buffer, sampleRate: 16_000 },\n      [floatSamples.buffer],\n    );\n  } catch {\n    webSenseBusy = false;\n  }\n}\n\nfunction fromBase64`;
  if (!runtimePattern.test(audio)) throw new Error('web sense v2 runtime block missing');
  audio = audio.replace(runtimePattern, runtimeReplacement);

  fs.writeFileSync(audioPath, audio);
}

const voicePath = 'components/GeminiVoiceConsole.tsx';
let voice = fs.readFileSync(voicePath, 'utf8');
if (!voice.includes('NUBO_WEB_SENSE_SOURCE_GUARD_V2')) {
  const detailAnchor = `        label?: string;\n      }>).detail;\n      const type = String(detail?.type ?? \"\").trim();\n      if (!type || silentUntilWakeRef.current || ecoSleepingRef.current) return;`;
  const detailReplacement = `        label?: string;\n        source?: string;\n      }>).detail;\n      if (detail?.source && detail.source !== \"web-yamnet\" && detail.source !== \"web-yamnet-v2\") return;\n      // NUBO_WEB_SENSE_SOURCE_GUARD_V2\n      const type = String(detail?.type ?? \"\").trim();\n      if (!type || silentUntilWakeRef.current || ecoSleepingRef.current) return;`;
  if (!voice.includes(detailAnchor)) throw new Error('web sense v2 voice source anchor missing');
  voice = voice.replace(detailAnchor, detailReplacement);
  fs.writeFileSync(voicePath, voice);
}

console.log('Applied Web NUBO Sense V2 robust worker lifecycle + overlapping windows');
