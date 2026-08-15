const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v65] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v65] patched ${path}`);
}

patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  if (!s.includes('speakNuboNotice')) {
    s = s.replace(
      'import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";',
      'import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";\nimport { speakNuboNotice } from "@/lib/nubo-feedback-audio";',
    );
  }

  s = s.replace(
    '  const youtubeFastRouteTimerRef = useRef<number | null>(null);',
    '  const youtubeFastRouteTimerRef = useRef<number | null>(null);\n  const responseSlaSettleTimerRef = useRef<number | null>(null);\n  const responseSlaTimerRef = useRef<number | null>(null);\n  const responseSlaPendingTextRef = useRef("");',
  );

  const anchor = `  const markSpeaking = () => {\n    notifyNuboVoicePhase("speaking");`;
  if (!s.includes('const clearResponseSla =')) {
    s = s.replace(anchor, `  const clearResponseSla = (cancelLocalNotice = true) => {\n    if (responseSlaSettleTimerRef.current !== null) {\n      window.clearTimeout(responseSlaSettleTimerRef.current);\n      responseSlaSettleTimerRef.current = null;\n    }\n    if (responseSlaTimerRef.current !== null) {\n      window.clearTimeout(responseSlaTimerRef.current);\n      responseSlaTimerRef.current = null;\n    }\n    responseSlaPendingTextRef.current = "";\n    if (cancelLocalNotice) window.speechSynthesis?.cancel();\n  };\n\n  const armResponseSla = (text: string) => {\n    const trimmed = text.trim();\n    if (!trimmed || silentUntilWakeRef.current) return;\n    responseSlaPendingTextRef.current = trimmed;\n\n    if (responseSlaSettleTimerRef.current !== null) {\n      window.clearTimeout(responseSlaSettleTimerRef.current);\n    }\n\n    // Wait briefly for Live transcription revisions so natural pauses do not\n    // trigger an acknowledgement in the middle of the user's sentence.\n    responseSlaSettleTimerRef.current = window.setTimeout(() => {\n      responseSlaSettleTimerRef.current = null;\n      if (responseSlaTimerRef.current !== null) {\n        window.clearTimeout(responseSlaTimerRef.current);\n      }\n      responseSlaTimerRef.current = window.setTimeout(() => {\n        responseSlaTimerRef.current = null;\n        if (!responseSlaPendingTextRef.current || silentUntilWakeRef.current) return;\n        setTranscript("NUBO正在處理，馬上回覆…");\n        notifyNuboVoicePhase("thinking");\n        speakNuboNotice("好，我來處理");\n      }, 1900);\n    }, 300);\n  };\n\n${anchor}`);
  }

  s = s.replace(
    '              if (part?.inlineData?.data) {\n                noteVoiceInteraction();\n                markSpeaking();',
    '              if (part?.inlineData?.data) {\n                clearResponseSla(true);\n                noteVoiceInteraction();\n                markSpeaking();',
  );

  s = s.replace(
    '            const trimmedUserText = userText.trim();\n\n            recordNuboQuestion(',
    '            const trimmedUserText = userText.trim();\n            armResponseSla(trimmedUserText);\n\n            recordNuboQuestion(',
  );

  s = s.replace(
    '    reconnectAttemptsRef.current = 0;\n    socketRef.current?.close();',
    '    reconnectAttemptsRef.current = 0;\n    clearResponseSla(true);\n    socketRef.current?.close();',
  );

  if (!s.includes('speakNuboNotice("好，我來處理")')) {
    throw new Error('V65 local response SLA notice missing');
  }
  if (!s.includes('}, 1900);') || !s.includes('}, 300);')) {
    throw new Error('V65 2.2s response SLA timing missing');
  }
  if (!s.includes('clearResponseSla(true);\n                noteVoiceInteraction();')) {
    throw new Error('V65 first-audio SLA cancellation missing');
  }
  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  const needle = '快速路由：';
  if (!s.includes('2.5秒內先給出簡短口頭回應')) {
    s = s.replace(
      needle,
      '回應速度規則：使用者說完後應盡快開始回答；若外部工具或網頁處理較慢，2.5秒內先給出簡短口頭回應，再接續完整結果。不得長時間完全無聲。\\n\\n' + needle,
    );
  }
  if (!s.includes('2.5秒內先給出簡短口頭回應')) {
    throw new Error('V65 response speed instruction missing');
  }
  return s;
});

console.log('Applied V65: 2.5-second audible response SLA guard');
