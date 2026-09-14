import fs from 'node:fs';

const marker = 'NUBO_GUEST_LINE_FAST_ROUTE_V2';
const path = 'components/GeminiVoiceConsole.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes(marker)) {
  const importAnchor = 'import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";';
  const classifierImport = 'import { classifyNuboGuestServiceTranscript } from "@/lib/nubo-guest-service-alert";';
  if (!source.includes(classifierImport)) {
    if (!source.includes(importAnchor)) throw new Error('guest LINE fast route: import anchor missing');
    source = source.replace(importAnchor, `${importAnchor}\n${classifierImport}`);
  }

  const helperAnchor = 'function sameYouTubeFastQuery(left: string, right: string) {';
  const helper = `// ${marker}\nlet nuboGuestLineTimer: number | null = null;\nlet nuboGuestLineLatestText = \"\";\nlet nuboGuestLineLastSent = \"\";\nlet nuboGuestLineLastSentAt = 0;\n\nfunction nuboChineseDigit(value: string) {\n  const map: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };\n  if (/^\\d+$/.test(value)) return Number(value);\n  if (value === \"十\") return 10;\n  const ten = value.match(/^([一二兩三四五六七八九])?十([一二兩三四五六七八九])?$/u);\n  if (ten) return (ten[1] ? map[ten[1]] : 1) * 10 + (ten[2] ? map[ten[2]] : 0);\n  if (value.length === 1 && value in map) return map[value];\n  return Number.NaN;\n}\n\nfunction extractNuboGuestRoomFast(text: string) {\n  const numeric = text.match(/(?:房號|房間|住在|住|到)?\\s*([A-Za-z]?\\d{2,4})\\s*(?:號?房|房間)?/iu);\n  if (numeric?.[1] && /\\d/.test(numeric[1])) return numeric[1].toUpperCase();\n\n  const floorRoom = text.match(/([一二兩三四五六七八九十\\d]{1,3})\\s*樓\\s*([一二兩三四五六七八九十\\d]{1,3})\\s*(?:號?房|房間)/u);\n  if (!floorRoom) return \"\";\n  const floor = nuboChineseDigit(floorRoom[1]);\n  const room = nuboChineseDigit(floorRoom[2]);\n  if (!Number.isFinite(floor) || !Number.isFinite(room)) return \"\";\n  return String(floor) + String(room).padStart(2, \"0\");\n}\n\nfunction scheduleNuboGuestLineFastRoute(text: string) {\n  const trimmed = text.trim();\n  if (!trimmed) return;\n\n  if (/(?:不用|不要|取消|算了|不用送|不用處理)/u.test(trimmed)) {\n    if (nuboGuestLineTimer !== null) {\n      window.clearTimeout(nuboGuestLineTimer);\n      nuboGuestLineTimer = null;\n    }\n    nuboGuestLineLatestText = \"\";\n    return;\n  }\n\n  const classification = classifyNuboGuestServiceTranscript(trimmed);\n  const structuralRoomDelivery = /(?:請)?(?:幫我)?(?:送|拿|補|給|帶|送來|拿來|補送|再送|送到|拿到)/u.test(trimmed) && /(?:房|客房|房間|房號|號房)/u.test(trimmed);\n  if (!classification.matched && !structuralRoomDelivery) return;\n\n  nuboGuestLineLatestText = trimmed;\n  if (nuboGuestLineTimer !== null) window.clearTimeout(nuboGuestLineTimer);\n\n  nuboGuestLineTimer = window.setTimeout(() => {\n    nuboGuestLineTimer = null;\n    const issue = nuboGuestLineLatestText.trim();\n    if (!issue) return;\n\n    const normalized = issue.replace(/[\\s　，,。.!！?？、:：;；'\"“”‘’（）()【】\\[\\]-]+/g, \"\").toLowerCase();\n    if (normalized === nuboGuestLineLastSent && Date.now() - nuboGuestLineLastSentAt < 180_000) return;\n\n    const roomNumber = extractNuboGuestRoomFast(issue);\n    void executeNuboBrowserTool({\n      name: \"guest_service_alert\",\n      args: { issue, roomNumber },\n    })\n      .then(() => {\n        nuboGuestLineLastSent = normalized;\n        nuboGuestLineLastSentAt = Date.now();\n      })\n      .catch((cause) => {\n        console.error(\"[guest-line-fast-route] send failed\", cause);\n      });\n  }, 700);\n}\n\n`;
  if (!source.includes(helperAnchor)) throw new Error('guest LINE fast route: helper anchor missing');
  source = source.replace(helperAnchor, `${helper}${helperAnchor}`);

  const eagerAnchor = '          const modelText = serverContent?.outputTranscription?.text;';
  const eagerCall = `${eagerAnchor}\n\n          // ${marker}: process user transcription before modelText can win the if/else branch.\n          if (typeof userText === \"string\" && userText.trim()) {\n            scheduleNuboGuestLineFastRoute(userText.trim());\n          }`;
  if (!source.includes(eagerAnchor)) throw new Error('guest LINE fast route: eager transcript anchor missing');
  source = source.replace(eagerAnchor, eagerCall);

  fs.writeFileSync(path, source);
}

console.log('Applied deterministic guest-service LINE fast route v2');
