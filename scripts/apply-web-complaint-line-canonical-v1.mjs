import fs from "node:fs";

const marker = "NUBO_COMPLAINT_LINE_CANONICAL_V1";

function patchGuestServiceRoute() {
  const path = "app/api/notify/guest-service/route.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const normalizeAnchor = `function normalize(value: string) {\n  return value\n    .trim()\n    .toLowerCase()\n    .replace(/[\\s　]+/g, "")\n    .replace(/[，。！？、,.!?]/g, "");\n}`;

  const traditionalHelper = `${normalizeAnchor}\n\n// ${marker}: final LINE output is always Taiwan Traditional Chinese.\n// Keep this deterministic at the delivery boundary instead of trusting model locale.\nconst NUBO_TW_PHRASE_PAIRS: Array<[string, string]> = [\n  ["客诉", "客訴"], ["投诉", "投訴"], ["房间", "房間"], ["塑胶", "塑膠"],\n  ["这个", "這個"], ["那个", "那個"], ["时间", "時間"], ["网页", "網頁"],\n  ["开启", "開啟"], ["赶快", "趕快"], ["点缀", "點綴"], ["设备", "設備"],\n  ["维修", "維修"], ["热水", "熱水"], ["空调", "空調"], ["问题", "問題"],\n  ["处理", "處理"], ["服务", "服務"], ["卫生", "衛生"], ["电视", "電視"],\n  ["网络", "網路"], ["窗户", "窗戶"], ["号码", "號碼"], ["楼层", "樓層"],\n];\n\nconst NUBO_TW_CHAR_PAIRS: Record<string, string> = {\n  "这":"這","时":"時","会":"會","买":"買","个":"個","点":"點","缀":"綴",\n  "赶":"趕","帮":"幫","开":"開","启":"啟","网":"網","页":"頁","间":"間",\n  "胶":"膠","号":"號","发":"發","设":"設","备":"備","维":"維","热":"熱",\n  "问":"問","题":"題","处":"處","务":"務","卫":"衛","电":"電","视":"視",\n  "马":"馬","厕":"廁","户":"戶","门":"門","录":"錄","诉":"訴","气":"氣",\n  "风":"風","温":"溫","烧":"燒","脏":"髒","旧":"舊","坏":"壞","声":"聲",\n  "灯":"燈","关":"關","锁":"鎖","楼":"樓","层":"層","饮":"飲","矿":"礦",\n  "条":"條","张":"張","刘":"劉","陈":"陳","杨":"楊","赵":"趙","吴":"吳",\n  "郑":"鄭","谢":"謝","钟":"鐘","简":"簡","体":"體","换":"換",\n};\n\nfunction toTaiwanTraditional(value: string) {\n  let result = value;\n  for (const [from, to] of NUBO_TW_PHRASE_PAIRS) {\n    result = result.split(from).join(to);\n  }\n  return Array.from(result, (char) => NUBO_TW_CHAR_PAIRS[char] ?? char).join("");\n}`;

  if (!source.includes(normalizeAnchor)) {
    throw new Error("complaint canonical: normalize anchor missing");
  }
  source = source.replace(normalizeAnchor, traditionalHelper);

  const issueAnchor = `    const issue = clean(body.issue ?? body.transcript ?? body.text);`;
  const issuePatch = `    const issue = toTaiwanTraditional(clean(body.issue ?? body.transcript ?? body.text));`;
  if (!source.includes(issueAnchor)) {
    throw new Error("complaint canonical: issue anchor missing");
  }
  source = source.replace(issueAnchor, issuePatch);

  const fingerprintAnchor = `    const fingerprint = [roomNumber || "unknown-room", categoryLabel, surname, issue]\n      .map(normalize)\n      .join(":");`;
  const fingerprintPatch = `    // Complaint duplicates can arrive from text + raw-audio with slightly different\n    // wording. Deduplicate by complaint session identity, not by model-generated issue text.\n    const fingerprint = (isComplaint\n      ? [roomNumber || "unknown-room", "complaint", surname || "unknown-surname"]\n      : [roomNumber || "unknown-room", categoryLabel, surname, issue])\n      .map(normalize)\n      .join(":");`;
  if (!source.includes(fingerprintAnchor)) {
    throw new Error("complaint canonical: fingerprint anchor missing");
  }
  source = source.replace(fingerprintAnchor, fingerprintPatch);

  const deliveryAnchor = `    const lineResult = await pushHotelLineText(lineText);\n    recentAlerts.set(fingerprint, Date.now());`;
  const deliveryPatch = `    // Reserve the fingerprint before the network call so two concurrent complaint\n    // paths cannot both pass the duplicate check. Roll back only if LINE delivery fails.\n    recentAlerts.set(fingerprint, now);\n    const lineResult = await pushHotelLineText(lineText).catch((error) => {\n      recentAlerts.delete(fingerprint);\n      throw error;\n    });`;
  if (!source.includes(deliveryAnchor)) {
    throw new Error("complaint canonical: delivery anchor missing");
  }
  source = source.replace(deliveryAnchor, deliveryPatch);

  fs.writeFileSync(path, source);
}

function patchComplaintAudioRoute() {
  const path = "app/api/notify/guest-service-audio/route.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const contextAnchor = `    ...(complaintContext ? [complaintContext] : []),`;
  const contextPatch = `    ...(complaintContext ? [complaintContext] : []),\n    // ${marker}\n    "所有中文輸出一律使用臺灣繁體中文，禁止使用簡體字。",\n    "客訴內容 issue 只能記錄旅客在本段音訊中明確說出的旅館問題；禁止推測、補寫、延伸、摘要其他對話、NUBO 自己說的話、背景聲、網頁指令或前後不相關內容。",\n    "房號若任何一碼不確定，roomNumber 必須留空並讓系統再次詢問；禁止用相近音猜成其他房號。",\n    ...(complaintIntake.active && complaintIntake.issueParts.length > 0\n      ? ["既有客訴內容已鎖定；本段 issue 必須輸出空字串，只允許補房號或姓氏，不可追加任何新客訴文字。"]\n      : []),`;
  if (!source.includes(contextAnchor)) {
    throw new Error("complaint canonical: complaint context anchor missing");
  }
  source = source.replace(contextAnchor, contextPatch);

  const issueMergeAnchor = `      const issueParts = mergeComplaintIssue(\n        complaintIntake.issueParts,\n        decision.issue,\n        roomNumber,\n        surname,\n      );`;
  const issueMergePatch = `      // Once explicit complaint content exists, freeze it. Room/surname turns must\n      // never append speaker echo, NUBO speech, background audio or unrelated commands.\n      const collectingMetadata =\n        complaintIntake.active && (!complaintIntake.roomNumber || !complaintIntake.surname);\n      const incomingIssue =\n        complaintIntake.issueParts.length > 0 || collectingMetadata ? "" : decision.issue;\n      const issueParts = mergeComplaintIssue(\n        complaintIntake.issueParts,\n        incomingIssue,\n        roomNumber,\n        surname,\n      );`;
  if (!source.includes(issueMergeAnchor)) {
    throw new Error("complaint canonical: issue merge anchor missing");
  }
  source = source.replace(issueMergeAnchor, issueMergePatch);

  fs.writeFileSync(path, source);
}

patchGuestServiceRoute();
patchComplaintAudioRoute();
console.log("Applied canonical single-delivery Traditional-Chinese complaint guard");
