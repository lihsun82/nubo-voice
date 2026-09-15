import fs from "node:fs";

const marker = "NUBO_AMENITY_SEMANTIC_DEDUPE_V1";
const path = "app/api/notify/guest-service/route.ts";
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
  const cleanupAnchor = `function wasRecentlyDelivered(key: string, now: number) {\n  cleanupRecentAlerts(now);\n  const previous = recentAlerts.get(key) ?? 0;\n  return now - previous < DUPLICATE_WINDOW_MS;\n}`;
  const cleanupPatch = `// ${marker}: multiple voice paths may paraphrase the same amenity request.\n// Dedupe by room + semantic amenity item instead of the full generated sentence.\nconst AMENITY_DUPLICATE_WINDOW_MS = 60_000;\n\nfunction wasRecentlyDelivered(\n  key: string,\n  now: number,\n  windowMs = DUPLICATE_WINDOW_MS,\n) {\n  cleanupRecentAlerts(now);\n  const previous = recentAlerts.get(key) ?? 0;\n  return now - previous < windowMs;\n}\n\nfunction canonicalAmenityItemKey(\n  issue: string,\n  matchedKeywords: string[],\n) {\n  const normalized = normalize(issue);\n  const knownItems = [\n    \"毛巾\", \"浴巾\", \"衛生紙\", \"牙刷\", \"牙膏\", \"刮鬍刀\", \"拖鞋\",\n    \"礦泉水\", \"瓶水\", \"飲用水\", \"枕頭\", \"棉被\", \"被子\", \"吹風機\",\n    \"衣架\", \"充電器\", \"轉接頭\", \"備品\",\n  ];\n  const items = knownItems.filter((item) => normalized.includes(normalize(item)));\n  if (items.length > 0) return items.map(normalize).sort().join(\"+\");\n\n  const aliasMap: Record<string, string> = {\n    \"送毛\": \"毛巾\",\n    \"毛今\": \"毛巾\",\n    \"毛金\": \"毛巾\",\n    \"毛經\": \"毛巾\",\n    \"送浴\": \"浴巾\",\n    \"浴今\": \"浴巾\",\n    \"浴金\": \"浴巾\",\n  };\n  const semantic = matchedKeywords\n    .map((item) => aliasMap[item] ?? item)\n    .map(normalize)\n    .filter(Boolean)\n    .sort();\n  return semantic.length > 0 ? Array.from(new Set(semantic)).join(\"+\") : \"amenity\";\n}`;
  if (!source.includes(cleanupAnchor)) {
    throw new Error("amenity semantic dedupe: recent-delivery anchor missing");
  }
  source = source.replace(cleanupAnchor, cleanupPatch);

  const complaintAnchor = `    if (isComplaint && (!roomNumber || !surname || !isSubstantiveIssue(issue))) {`;
  const complaintPatch = `    const isAmenityRequest =\n      classification.matched && classification.category === \"amenity\";\n    const isRoomDeliveryRequest =\n      isAmenityRequest ||\n      /送.{0,8}(?:房間|客房|房)|送物到房間|品項語音不確定/u.test(issue);\n\n    // A delivery alert without a room number is not actionable and was a major\n    // source of duplicate/noisy LINE messages. Ask the voice flow to collect it\n    // instead of notifying staff prematurely.\n    if (!isComplaint && isRoomDeliveryRequest && !roomNumber) {\n      return NextResponse.json(\n        {\n          ok: false,\n          sent: false,\n          requiresRoomNumber: true,\n          missingFields: [\"房號\"],\n          error: \"備品／送物需求尚缺房號，暫不送出通知。\",\n        },\n        { status: 409 },\n      );\n    }\n\n${complaintAnchor}`;
  if (!source.includes(complaintAnchor)) {
    throw new Error("amenity semantic dedupe: complaint gate anchor missing");
  }
  source = source.replace(complaintAnchor, complaintPatch);

  const fingerprintAnchor = `    const fingerprint = (isComplaint\n      ? [roomNumber || \"unknown-room\", \"complaint\", surname || \"unknown-surname\"]\n      : [roomNumber || \"unknown-room\", categoryLabel, surname, issue])\n      .map(normalize)\n      .join(\":\");`;
  const fingerprintPatch = `    const amenityItemKey = isAmenityRequest\n      ? canonicalAmenityItemKey(issue, classification.matchedKeywords)\n      : \"\";\n    const fingerprint = (isComplaint\n      ? [roomNumber || \"unknown-room\", \"complaint\", surname || \"unknown-surname\"]\n      : isAmenityRequest\n        ? [roomNumber, \"amenity\", amenityItemKey]\n        : [roomNumber || \"unknown-room\", categoryLabel, surname, issue])\n      .map(normalize)\n      .join(\":\");`;
  if (!source.includes(fingerprintAnchor)) {
    throw new Error("amenity semantic dedupe: canonical fingerprint anchor missing");
  }
  source = source.replace(fingerprintAnchor, fingerprintPatch);

  const recentAnchor = `    if (wasRecentlyDelivered(fingerprint, now)) {`;
  const recentPatch = `    if (\n      wasRecentlyDelivered(\n        fingerprint,\n        now,\n        isAmenityRequest ? AMENITY_DUPLICATE_WINDOW_MS : DUPLICATE_WINDOW_MS,\n      )\n    ) {`;
  if (!source.includes(recentAnchor)) {
    throw new Error("amenity semantic dedupe: duplicate check anchor missing");
  }
  source = source.replace(recentAnchor, recentPatch);

  fs.writeFileSync(path, source);
}

console.log("Applied semantic amenity single-delivery dedupe");
