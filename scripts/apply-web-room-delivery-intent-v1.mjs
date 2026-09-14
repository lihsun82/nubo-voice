import fs from 'node:fs';

const path = 'lib/nubo-guest-service-alert.ts';
let s = fs.readFileSync(path, 'utf8');
const marker = 'NUBO_ROOM_DELIVERY_INTENT_V1';

if (!s.includes(marker)) {
  const anchor = `function matchedKeywords(text: string, keywords: string[]) {\n  return keywords.filter((keyword) => text.includes(normalize(keyword)));\n}\n`;
  const patch = `function matchedKeywords(text: string, keywords: string[]) {\n  return keywords.filter((keyword) => text.includes(normalize(keyword)));\n}\n\n// ${marker}\n// Hotel ASR can mishear the requested item while still preserving the service\n// structure (for example: \"幫我送兩條煙到三樓五號房\" for 毛巾).\n// Any clear deliver/bring/replenish request directed to a guest room is still\n// actionable hotel service and must reach the LINE operations channel.\nfunction matchesRoomDeliveryIntent(text: string) {\n  const hasDeliveryVerb = /(?:請)?(?:幫我)?(?:送|拿|補|給|帶|送來|拿來|補送|再送|送到|拿到)/u.test(text);\n  const hasRoomDestination = /(?:房|客房|房間|房號|號房)/u.test(text);\n  return hasDeliveryVerb && hasRoomDestination;\n}\n`;
  if (!s.includes(anchor)) throw new Error('room delivery intent: classifier anchor missing');
  s = s.replace(anchor, patch);

  const beforeFallback = `  const request = matchedKeywords(text, REQUEST_PHRASES);\n  const hotelContext = matchedKeywords(text, HOTEL_CONTEXT_KEYWORDS);`;
  const structuralRoute = `  if (matchesRoomDeliveryIntent(text)) {\n    return {\n      matched: true,\n      category: \"general_request\",\n      urgency: \"normal\",\n      matchedKeywords: [\"room-delivery-intent\"],\n    };\n  }\n\n  const request = matchedKeywords(text, REQUEST_PHRASES);\n  const hotelContext = matchedKeywords(text, HOTEL_CONTEXT_KEYWORDS);`;
  if (!s.includes(beforeFallback)) throw new Error('room delivery intent: fallback anchor missing');
  s = s.replace(beforeFallback, structuralRoute);

  fs.writeFileSync(path, s);
}

console.log('Applied room-delivery structural guest-service intent');
