import fs from "node:fs";

const marker = "NUBO_AMENITY_RECALL_BALANCE_V1";
const path = "app/api/notify/guest-service-audio/route.ts";

let source = fs.readFileSync(path, "utf8");
if (!source.includes(marker)) {
  if (!source.includes("NUBO_GUEST_VOICE_ECHO_GUARD_V1")) {
    throw new Error("amenity recall balance: echo guard must run first");
  }

  const strictPrompt = `    "非客訴的一般客務只有在『旅客本人』的需求、房號與要處理的品項/問題都清楚可辨時才 guestService=true；任何關鍵字不確定就不要猜。",`;
  const balancedPrompt = `    // ${marker}
    "非客訴的一般客務：只要清楚聽到有效房號，且清楚聽到常見備品/物品（例如毛巾、浴巾、礦泉水、飲用水、牙刷、牙膏、衛生紙、拖鞋、枕頭、棉被、吹風機）或明確設備問題，就應 guestService=true；即使『幫我送／需要／麻煩』等請求動詞被切掉或少一兩個字，也不要漏報。",
    "只有『房號本身不確定』或『品項/問題本身不確定』時才 guestService=false。房號與品項都清楚時，不要因句子不完整、停頓或音訊切段而判 false。",`;
  if (!source.includes(strictPrompt)) {
    throw new Error("amenity recall balance: strict prompt anchor missing");
  }
  source = source.replace(strictPrompt, balancedPrompt);

  const threshold = `    if (!decision.guestService || decision.confidence < 0.82) {`;
  const thresholdPatch = `    // ${marker}: explicit room + actionable issue is strong enough for normal hotel
    // service. Keep the higher 0.82 bar only when one of those fields is missing.
    const minGuestConfidence =
      decision.roomNumber && decision.issue ? 0.68 : 0.82;
    if (!decision.guestService || decision.confidence < minGuestConfidence) {`;
  if (!source.includes(threshold)) {
    throw new Error("amenity recall balance: confidence anchor missing");
  }
  source = source.replace(threshold, thresholdPatch);

  fs.writeFileSync(path, source);
}

const verify = fs.readFileSync(path, "utf8");
if (!verify.includes(marker)) {
  throw new Error("amenity recall balance verification failed");
}

console.log("Applied balanced amenity recall without reopening speaker-echo alerts");
