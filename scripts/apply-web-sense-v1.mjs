import fs from 'node:fs';

const audioPath = 'lib/browser-audio.ts';
let audio = fs.readFileSync(audioPath, 'utf8');
const AUDIO_MARKER = 'NUBO_WEB_SENSE_YAMNET_V1';

if (!audio.includes(AUDIO_MARKER)) {
  const insertionAnchor = `function fromBase64(value: string): Uint8Array {`;
  if (!audio.includes(insertionAnchor)) {
    throw new Error('web sense v1: browser-audio insertion anchor missing');
  }

  const webSenseHelpers = `// ${AUDIO_MARKER}\nlet webSenseWorker: Worker | null = null;\nlet webSenseChunks: Uint8Array[] = [];\nlet webSenseBytes = 0;\nlet webSenseBusy = false;\nlet webSensePlaybackActive = false;\nlet webSenseDisabledUntil = 0;\nconst NUBO_WEB_SENSE_FRAME_BYTES = 31_200; // YAMNet 0.975 s at PCM16/16 kHz.\n\nfunction hasNativeSenseBridge() {\n  if (typeof window === \"undefined\") return false;\n  try {\n    const bridge = (window as typeof window & {\n      NuboNative?: { pushSensePcm16Base64?: (pcmBase64: string) => boolean };\n    }).NuboNative;\n    return typeof bridge?.pushSensePcm16Base64 === \"function\";\n  } catch {\n    return false;\n  }\n}\n\nfunction resetWebSenseBuffer() {\n  webSenseChunks = [];\n  webSenseBytes = 0;\n}\n\nfunction disableWebSenseTemporarily() {\n  webSenseDisabledUntil = Date.now() + 60_000;\n  webSenseBusy = false;\n  resetWebSenseBuffer();\n  if (webSenseWorker) {\n    try { webSenseWorker.terminate(); } catch {}\n    webSenseWorker = null;\n  }\n}\n\nfunction ensureWebSenseWorker() {\n  if (typeof window === \"undefined\" || hasNativeSenseBridge()) return null;\n  if (Date.now() < webSenseDisabledUntil) return null;\n  if (webSenseWorker) return webSenseWorker;\n\n  try {\n    const worker = new Worker(\"/nubo-sense-worker.js\", { type: \"module\" });\n    worker.onmessage = (message: MessageEvent) => {\n      const data = message.data as {\n        type?: string;\n        event?: {\n          type?: string;\n          label?: string;\n          confidence?: number;\n          timestampMs?: number;\n          source?: string;\n        };\n      };\n      if (data?.type === \"classified\") {\n        webSenseBusy = false;\n        return;\n      }\n      if (data?.type === \"event\" && data.event?.type) {\n        window.dispatchEvent(new CustomEvent(\"nubo:sense-event\", {\n          detail: data.event,\n        }));\n        return;\n      }\n      if (data?.type === \"error\") {\n        disableWebSenseTemporarily();\n      }\n    };\n    worker.onerror = () => disableWebSenseTemporarily();\n    webSenseWorker = worker;\n    worker.postMessage({ type: \"init\" });\n    return worker;\n  } catch {\n    disableWebSenseTemporarily();\n    return null;\n  }\n}\n\nfunction forwardPcmToWebSense(pcm: Uint8Array) {\n  if (typeof window === \"undefined\" || hasNativeSenseBridge()) return;\n  if (webSensePlaybackActive || webSenseBusy) return;\n  const worker = ensureWebSenseWorker();\n  if (!worker) return;\n\n  webSenseChunks.push(pcm.slice());\n  webSenseBytes += pcm.length;\n  if (webSenseBytes < NUBO_WEB_SENSE_FRAME_BYTES) return;\n\n  const merged = new Uint8Array(webSenseBytes);\n  let offset = 0;\n  for (const chunk of webSenseChunks) {\n    merged.set(chunk, offset);\n    offset += chunk.length;\n  }\n  const frame = merged.slice(0, NUBO_WEB_SENSE_FRAME_BYTES);\n  const remainder = merged.slice(NUBO_WEB_SENSE_FRAME_BYTES);\n  resetWebSenseBuffer();\n  if (remainder.length) {\n    webSenseChunks = [remainder];\n    webSenseBytes = remainder.length;\n  }\n\n  const sampleCount = Math.floor(frame.byteLength / 2);\n  const floatSamples = new Float32Array(sampleCount);\n  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);\n  for (let i = 0; i < sampleCount; i += 1) {\n    floatSamples[i] = view.getInt16(i * 2, true) / 0x8000;\n  }\n\n  webSenseBusy = true;\n  try {\n    worker.postMessage(\n      { type: \"classify\", audioBuffer: floatSamples.buffer, sampleRate: 16_000 },\n      [floatSamples.buffer],\n    );\n  } catch {\n    webSenseBusy = false;\n  }\n}\n\n`;

  audio = audio.replace(insertionAnchor, webSenseHelpers + insertionAnchor);

  const dispatchAnchor = `function dispatchPlaybackState(active: boolean) {\n  if (typeof window === \"undefined\") return;`;
  const dispatchReplacement = `function dispatchPlaybackState(active: boolean) {\n  webSensePlaybackActive = active;\n  if (active) resetWebSenseBuffer();\n  if (typeof window === \"undefined\") return;`;
  if (!audio.includes(dispatchAnchor)) {
    throw new Error('web sense v1: playback state anchor missing');
  }
  audio = audio.replace(dispatchAnchor, dispatchReplacement);

  const startAnchor = `    this.preRoll = [];\n    resetNativeSenseBuffer();\n\n    this.stream = await navigator.mediaDevices.getUserMedia({`;
  const startReplacement = `    this.preRoll = [];\n    resetNativeSenseBuffer();\n    resetWebSenseBuffer();\n    ensureWebSenseWorker();\n\n    this.stream = await navigator.mediaDevices.getUserMedia({`;
  if (!audio.includes(startAnchor)) {
    throw new Error('web sense v1: microphone start anchor missing');
  }
  audio = audio.replace(startAnchor, startReplacement);

  const pcmAnchor = `      forwardPcmToNativeSense(pcm);\n      const base64 = toBase64(pcm);`;
  const pcmReplacement = `      forwardPcmToNativeSense(pcm);\n      forwardPcmToWebSense(pcm);\n      const base64 = toBase64(pcm);`;
  if (!audio.includes(pcmAnchor)) {
    throw new Error('web sense v1: PCM tap anchor missing');
  }
  audio = audio.replace(pcmAnchor, pcmReplacement);

  fs.writeFileSync(audioPath, audio);
}

const voicePath = 'components/GeminiVoiceConsole.tsx';
let voice = fs.readFileSync(voicePath, 'utf8');
const VOICE_MARKER = 'NUBO_WEB_SENSE_MAIN_VOICE_V1';

if (!voice.includes(VOICE_MARKER)) {
  const senseEffectPattern = /  useEffect\(\(\) => \{\n    const handleSenseEvent = \(event: Event\) => \{[\s\S]*?window\.removeEventListener\(\"nubo:sense-event\", handleSenseEvent\);\n  \}, \[\]\);/;
  if (!senseEffectPattern.test(voice)) {
    throw new Error('web sense v1: existing sense event effect missing');
  }

  const replacement = `  // ${VOICE_MARKER}\n  useEffect(() => {\n    const handleSenseEvent = (event: Event) => {\n      const detail = (event as CustomEvent<{\n        type?: string;\n        confidence?: number;\n        label?: string;\n      }>).detail;\n      const type = String(detail?.type ?? \"\").trim();\n      if (!type || silentUntilWakeRef.current || ecoSleepingRef.current) return;\n\n      const prompts: Record<string, string> = {\n        cough: \"【NUBO Sense 本機事件】使用者剛剛咳嗽或清喉嚨。用目前選定的 NUBO 聲音與人格，自然簡短關心一句，例如提醒喝口水。不要提系統、模型、辨識或信心分數，也不要做醫療診斷。\",\n        sneeze: \"【NUBO Sense 本機事件】使用者剛剛打噴嚏。用目前選定的 NUBO 聲音與人格自然短回一句，例如『哈啾，保重喔』。不要提系統、模型或事件偵測。\",\n        yawn: \"【NUBO Sense 本機事件】使用者剛剛打哈欠。用目前選定的 NUBO 聲音與人格自然簡短問是不是累了。不要提系統或事件偵測。\",\n        breathing: \"【NUBO Sense 本機事件】使用者剛剛有明顯嘆氣、喘息或呼吸聲。用目前選定的 NUBO 聲音與人格自然簡短問候是否還好；不要做醫療診斷。\",\n        laughter: \"【NUBO Sense 本機事件】使用者剛剛笑了。用目前選定的 NUBO 聲音與人格自然輕鬆回一句，不要提事件偵測。\",\n        scream: \"【NUBO Sense 本機事件】使用者剛剛突然叫了一聲或尖叫。用目前選定的 NUBO 聲音立即簡短問『怎麼了，需要我幫忙嗎？』不要自行報警。\",\n        crying: \"【NUBO Sense 本機事件】使用者剛剛有哭聲。用目前選定的 NUBO 聲音溫和簡短問他還好嗎。\",\n      };\n\n      const prompt = prompts[type];\n      if (!prompt) return;\n      const socket = socketRef.current;\n      if (!socket || socket.readyState !== WebSocket.OPEN) return;\n\n      try {\n        noteVoiceInteraction();\n        socket.send(JSON.stringify({\n          clientContent: {\n            turns: [{ role: \"user\", parts: [{ text: prompt }] }],\n            turnComplete: true,\n          },\n        }));\n      } catch {\n        // Sense is fail-open: ordinary NUBO voice must keep working.\n      }\n    };\n    window.addEventListener(\"nubo:sense-event\", handleSenseEvent);\n    return () => window.removeEventListener(\"nubo:sense-event\", handleSenseEvent);\n  }, []);`;

  voice = voice.replace(senseEffectPattern, replacement);

  // Keep a little more pre-roll so short transients such as coughs/sneezes are
  // not clipped before Live audio understanding sees them as well.
  if (voice.includes('prefixPaddingMs: 150,')) {
    voice = voice.replace('prefixPaddingMs: 150,', 'prefixPaddingMs: 320,');
  }

  fs.writeFileSync(voicePath, voice);
}

console.log('Applied Web NUBO Sense V1: YAMNet worker + main-voice reactions');
