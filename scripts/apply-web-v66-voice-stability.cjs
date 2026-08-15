const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v66] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v66] patched ${path}`);
}

patch('lib/browser-audio.ts', (source) => {
  let s = source;
  if (!s.includes('nubo:user-voice-activity')) {
    s = s.replace(
      '      if (voiceDetected) this.lastVoiceAt = now;',
      '      if (voiceDetected) {\n        this.lastVoiceAt = now;\n        if (typeof window !== "undefined") {\n          window.dispatchEvent(new CustomEvent("nubo:user-voice-activity", { detail: { at: now, rms } }));\n        }\n      }',
    );
  }
  if (!s.includes('nubo:user-voice-activity')) throw new Error('V66 voice activity event missing');
  return s;
});

patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  s = s.replace(
    '  const responseSlaPendingTextRef = useRef("");',
    '  const responseSlaPendingTextRef = useRef("");\n  const toolInFlightRef = useRef(0);\n  const lastFillerKeyRef = useRef("");\n  const lastFillerAtRef = useRef(0);',
  );

  if (!s.includes('nubo:user-voice-activity')) {
    s = s.replace(
      '  const noteVoiceInteraction = () => {\n    lastInteractionAtRef.current = Date.now();\n  };',
      '  const noteVoiceInteraction = () => {\n    lastInteractionAtRef.current = Date.now();\n  };\n\n  useEffect(() => {\n    const onVoiceActivity = () => {\n      if (!ecoSleepingRef.current) noteVoiceInteraction();\n    };\n    window.addEventListener("nubo:user-voice-activity", onVoiceActivity);\n    return () => window.removeEventListener("nubo:user-voice-activity", onVoiceActivity);\n  }, []);',
    );
  }

  s = s.replace(
    '  const enterEcoSleep = async () => {\n    if (ecoSleepingRef.current || closingRef.current) return;',
    '  const enterEcoSleep = async () => {\n    if (ecoSleepingRef.current || closingRef.current) return;\n    // V66: never tear down the cloud voice session while a user turn or tool is still active.\n    if (responseSlaPendingTextRef.current || toolInFlightRef.current > 0) {\n      noteVoiceInteraction();\n      return;\n    }',
  );

  const toolLoop = '            for (const call of calls as FunctionCall[]) {\n              try {';
  if (s.includes(toolLoop) && !s.includes('const fillerForTool')) {
    const helper = `  const fillerForTool = (call: FunctionCall) => {\n    const now = Date.now();\n    const name = call.name || "";\n    const key = name + ":" + JSON.stringify(call.args ?? {});\n    if (key === lastFillerKeyRef.current && now - lastFillerAtRef.current < 5000) return;\n    lastFillerKeyRef.current = key;\n    lastFillerAtRef.current = now;\n    let phrase = "嗯，好，我幫你處理一下";\n    if (name === "get_weather") phrase = "嗯，我幫你看一下現在的天氣喔";\n    else if (name === "search_nearby") phrase = "好，我幫你找一下附近的資訊";\n    else if (name === "open_website" || name === "open_mobile_app") phrase = "好，我幫你開一下";\n    else if (name === "research_now") phrase = "嗯，我查一下最新資料喔";\n    else if (name === "hotel_market_report" || name === "hotel_market_refresh") phrase = "好，我幫你查一下最新房價";\n    setTranscript(phrase + "…");\n    notifyNuboVoicePhase("thinking");\n    speakNuboNotice(phrase);\n  };\n\n`;
    s = s.replace('  const clearResponseSla = (cancelLocalNotice = true) => {', helper + '  const clearResponseSla = (cancelLocalNotice = true) => {');
    s = s.replace(
      toolLoop,
      '            for (const call of calls as FunctionCall[]) {\n              toolInFlightRef.current += 1;\n              noteVoiceInteraction();\n              fillerForTool(call);\n              try {',
    );
    s = s.replace(
      '              } catch (cause) {\n                functionResponses.push({',
      '              } catch (cause) {\n                functionResponses.push({',
    );
    // Decrement once for each call after success/error response is assembled, immediately before loop continues.
    s = s.replace(
      '            }\n\n            socket.send(\n              JSON.stringify({\n                toolResponse:',
      '              } finally {\n                toolInFlightRef.current = Math.max(0, toolInFlightRef.current - 1);\n                noteVoiceInteraction();\n              }\n            }\n\n            socket.send(\n              JSON.stringify({\n                toolResponse:',
    );
  }

  if (!s.includes('toolInFlightRef.current > 0')) throw new Error('V66 eco guard missing');
  if (!s.includes('nubo:user-voice-activity')) throw new Error('V66 user activity listener missing');
  if (!s.includes('我幫你看一下現在的天氣喔')) throw new Error('V66 weather filler missing');
  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  if (!s.includes('背景工具查詢時可用自然語助詞')) {
    s = s.replace(
      '回應速度規則：使用者說完後應盡快開始回答；若外部工具或網頁處理較慢，2.5秒內先給出簡短口頭回應，再接續完整結果。不得長時間完全無聲。',
      '回應速度規則：使用者說完後應盡快開始回答；若外部工具或網頁處理較慢，2.5秒內先給出簡短口頭回應，再接續完整結果。不得長時間完全無聲。背景工具查詢時可用自然語助詞，例如「嗯，我幫你看一下喔」「好，我查一下」，但不要重複、不要假裝已完成。',
    );
  }
  return s;
});

console.log('Applied V66: voice activity keepalive + in-flight eco guard + contextual fillers');
