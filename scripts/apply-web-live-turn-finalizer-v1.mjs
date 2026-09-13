import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
const marker = 'NUBO_LIVE_TURN_FINALIZER_V1';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes(marker)) {
  const refAnchor = '  const lastUserTextRef = useRef("");';
  const refPatch = `${refAnchor}\n  // ${marker}: if Live transcription stops changing, explicitly close the audio stream.\n  const liveTurnFinalizeTimerRef = useRef<number | null>(null);\n  const liveTurnFinalizeTextRef = useRef("");`;
  if (!source.includes(refAnchor)) {
    throw new Error('live turn finalizer: ref anchor missing');
  }
  source = source.replace(refAnchor, refPatch);

  const eagerCall = `            void processNuboGuestServiceTranscript(userText.trim()).catch((cause) => {\n              console.warn("NUBO eager guest-service intake failed", cause);\n            });`;
  const eagerPatch = `${eagerCall}\n\n            const stableUserText = userText.trim();\n            if (stableUserText !== liveTurnFinalizeTextRef.current) {\n              liveTurnFinalizeTextRef.current = stableUserText;\n              if (liveTurnFinalizeTimerRef.current !== null) {\n                window.clearTimeout(liveTurnFinalizeTimerRef.current);\n              }\n              liveTurnFinalizeTimerRef.current = window.setTimeout(() => {\n                liveTurnFinalizeTimerRef.current = null;\n                const ws = socketRef.current;\n                if (ws?.readyState === WebSocket.OPEN) {\n                  try {\n                    ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));\n                  } catch (cause) {\n                    console.warn("NUBO audioStreamEnd fallback failed", cause);\n                  }\n                }\n              }, 1800);\n            }`;
  if (!source.includes(eagerCall)) {
    throw new Error('live turn finalizer: eager guest-service anchor missing');
  }
  source = source.replace(eagerCall, eagerPatch);

  const modelAnchor = '          if (typeof modelText === "string" && modelText.trim()) {';
  const modelPatch = `          if (typeof modelText === "string" && modelText.trim()) {\n            if (liveTurnFinalizeTimerRef.current !== null) {\n              window.clearTimeout(liveTurnFinalizeTimerRef.current);\n              liveTurnFinalizeTimerRef.current = null;\n            }\n            liveTurnFinalizeTextRef.current = "";`;
  if (!source.includes(modelAnchor)) {
    throw new Error('live turn finalizer: model output anchor missing');
  }
  source = source.replace(modelAnchor, modelPatch);

  fs.writeFileSync(path, source);
}

if (!source.includes(marker)) {
  throw new Error('live turn finalizer marker missing after patch');
}
if (!source.includes('audioStreamEnd: true')) {
  throw new Error('live turn finalizer audioStreamEnd missing after patch');
}

console.log('Applied Gemini Live stable-transcript audioStreamEnd fallback');
