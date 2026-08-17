import fs from 'node:fs';

const consolePath = 'components/GeminiVoiceConsole.tsx';
const toolsPath = 'lib/browser-nubo-tools-line.ts';

let consoleSource = fs.readFileSync(consolePath, 'utf8');

if (!consoleSource.includes('NUBO_LOOKUP_FILLER_V1')) {
  const constantsAnchor = 'const NUBO_ECO_IDLE_MS = 30_000;';
  const constantsPatch = `${constantsAnchor}\n\n// NUBO_LOOKUP_FILLER_V1\n// Keep the conversation alive while backend lookup tools run. The filler is\n// intentionally short and is cancelled as soon as real model audio arrives.\nconst NUBO_LOOKUP_FILLERS = [\n  \"好喔，我幫你查一下嘿，稍等我一下唷。\",\n  \"好，我幫你看一下喔，馬上幫你查。\",\n  \"嗯嗯，我查一下最新資料嘿，稍等我一下唷。\",\n] as const;\nconst NUBO_LOOKUP_FILLER_COOLDOWN_MS = 2500;\n\nfunction shouldSpeakLookupFiller(text: string) {\n  const normalized = text.trim().toLowerCase();\n  if (!normalized) return false;\n  return /查|搜尋|找一下|幫我找|最新|查證|比較|附近|天氣|氣溫|下雨|房價|房型|空房|航班|機票|行程|景點|餐廳|營業時間|交通|匯率|新聞|資料/.test(normalized);\n}`;
  if (!consoleSource.includes(constantsAnchor)) {
    throw new Error('lookup filler: constants anchor missing');
  }
  consoleSource = consoleSource.replace(constantsAnchor, constantsPatch);

  const refsAnchor = '  const lastUserTextRef = useRef("");';
  const refsPatch = `${refsAnchor}\n  const lastLookupFillerAtRef = useRef(0);\n  const lookupFillerIndexRef = useRef(0);`;
  if (!consoleSource.includes(refsAnchor)) {
    throw new Error('lookup filler: refs anchor missing');
  }
  consoleSource = consoleSource.replace(refsAnchor, refsPatch);

  const acknowledgeAnchor = `  const acknowledgeQuestion = (text: string) => {\n    const trimmed = text.trim();`;
  const acknowledgePatch = `  const speakLookupFiller = (text: string) => {\n    if (!shouldSpeakLookupFiller(text)) return;\n    if (silentUntilWakeRef.current) return;\n\n    const now = Date.now();\n    if (now - lastLookupFillerAtRef.current < NUBO_LOOKUP_FILLER_COOLDOWN_MS) {\n      return;\n    }\n\n    if (\n      typeof window === \"undefined\" ||\n      !window.speechSynthesis ||\n      typeof SpeechSynthesisUtterance === \"undefined\"\n    ) {\n      return;\n    }\n\n    lastLookupFillerAtRef.current = now;\n    const phrase =\n      NUBO_LOOKUP_FILLERS[\n        lookupFillerIndexRef.current % NUBO_LOOKUP_FILLERS.length\n      ];\n    lookupFillerIndexRef.current += 1;\n\n    const utterance = new SpeechSynthesisUtterance(phrase);\n    utterance.lang = \"zh-TW\";\n    utterance.rate = 1.02;\n    utterance.pitch = 1;\n    utterance.volume = 1;\n\n    const voices = window.speechSynthesis.getVoices();\n    const voice =\n      voices.find((candidate) => candidate.lang.toLowerCase() === \"zh-tw\") ??\n      voices.find((candidate) => candidate.lang.toLowerCase().startsWith(\"zh\"));\n    if (voice) utterance.voice = voice;\n\n    window.speechSynthesis.cancel();\n    markSpeaking();\n    window.speechSynthesis.speak(utterance);\n  };\n\n  const acknowledgeQuestion = (text: string) => {\n    const trimmed = text.trim();`;
  if (!consoleSource.includes(acknowledgeAnchor)) {
    throw new Error('lookup filler: acknowledge anchor missing');
  }
  consoleSource = consoleSource.replace(acknowledgeAnchor, acknowledgePatch);

  const transcriptAnchor = '    setTranscript(`正在處理：${trimmed}`);';
  const transcriptPatch = `${transcriptAnchor}\n    speakLookupFiller(trimmed);`;
  if (!consoleSource.includes(transcriptAnchor)) {
    throw new Error('lookup filler: transcript anchor missing');
  }
  consoleSource = consoleSource.replace(transcriptAnchor, transcriptPatch);

  // Trigger filler on the very first user transcription event, before model text
  // or tool-call handling can skip the later acknowledgement branch.
  const earlyAnchor = `          const userText = serverContent?.inputTranscription?.text;\n          const modelText = serverContent?.outputTranscription?.text;`;
  const earlyPatch = `${earlyAnchor}\n          if (typeof userText === \"string\" && userText.trim()) {\n            speakLookupFiller(userText.trim());\n          }`;
  if (!consoleSource.includes(earlyAnchor)) {
    throw new Error('lookup filler: early transcription anchor missing');
  }
  consoleSource = consoleSource.replace(earlyAnchor, earlyPatch);

  const audioAnchor = `              if (part?.inlineData?.data) {\n                noteVoiceInteraction();`;
  const audioPatch = `              if (part?.inlineData?.data) {\n                window.speechSynthesis?.cancel();\n                noteVoiceInteraction();`;
  if (!consoleSource.includes(audioAnchor)) {
    throw new Error('lookup filler: model audio anchor missing');
  }
  consoleSource = consoleSource.replace(audioAnchor, audioPatch);
}

fs.writeFileSync(consolePath, consoleSource);

let toolsSource = fs.readFileSync(toolsPath, 'utf8');
const oldSafety = '- 簡單問題直接回答。執行工具或思考期間禁止說「請稍等」「等一下」「我正在處理」或「我正在查找」。';
const newSafety = '- 簡單問題直接回答。需要查詢外部或即時資料時，前端會在收到旅客查詢語句的第一時間播放一句自然承接語（例如「好喔，我幫你查一下嘿，稍等我一下唷」）；你必須同時立即呼叫正確工具，不等待承接語播完，也不要重複另一句等待語。禁止長篇拖延、禁止假裝已查到結果。';
if (toolsSource.includes(oldSafety)) {
  toolsSource = toolsSource.replace(oldSafety, newSafety);
} else if (!toolsSource.includes(newSafety)) {
  const previousSafety = '- 簡單問題直接回答。需要查詢外部或即時資料時，前端會先播放一句很短、自然的承接語（例如「嗯，我幫你看一下」）；你必須同時立即呼叫正確工具，不等待承接語播完，也不要重複另一句等待語。禁止長篇拖延、禁止假裝已查到結果。';
  if (toolsSource.includes(previousSafety)) {
    toolsSource = toolsSource.replace(previousSafety, newSafety);
  } else {
    throw new Error('lookup filler: system-instruction safety anchor missing');
  }
}

fs.writeFileSync(toolsPath, toolsSource);
console.log('Applied NUBO lookup filler V1: immediate audible filler on first user transcription + concurrent backend lookup');
