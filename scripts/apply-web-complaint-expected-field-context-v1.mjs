import fs from "node:fs";

const marker = "NUBO_COMPLAINT_EXPECTED_FIELD_CONTEXT_V1";
const path = "app/api/notify/guest-service-audio/route.ts";
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
  const signature = `async function analyzeGuestAudio(wavBase64: string) {`;
  const replacement = `// ${marker}\nasync function analyzeGuestAudio(\n  wavBase64: string,\n  complaintIntake: ComplaintIntakeSnapshot,\n) {`;
  if (!source.includes(signature)) {
    throw new Error("complaint expected-field context: analyze signature missing");
  }
  source = source.replace(signature, replacement);

  const promptAnchor = `  const prompt = [`;
  const promptPatch = `  const complaintContext = complaintIntake.active\n    ? !complaintIntake.roomNumber\n      ? [\n          "目前旅客已在客訴流程，現在正在回答【房號】。",\n          "這段音訊優先只抽取房號 roomNumber；surname 與 issue 沒有明確聽到就留空。",\n          "中文數字要逐字轉成阿拉伯數字：三零五=305、三〇五=305、三一五=315、三零一=301、二零八=208。",\n          "不要自行把『三零五』改猜成301、405或樓層；必須依實際每個數字音節轉換。",\n        ].join("\\n")\n      : !complaintIntake.surname\n        ? [\n            "目前旅客已在客訴流程，房號已取得，現在正在回答【姓氏】。",\n            "這段音訊優先只抽取 surname。像『李』『我姓李』『林先生』都要回傳該姓氏；roomNumber 不要改寫，issue 沒有明確內容就留空。",\n          ].join("\\n")\n        : complaintIntake.issueParts.length === 0\n          ? "目前旅客已在客訴流程，房號與姓氏已取得；這段音訊主要是在回答客訴內容 issue。"\n          : "目前旅客已在客訴流程；已有房號、姓氏與部分客訴內容。只補充這段新資訊，不要改寫既有欄位。"\n    : "";\n\n${promptAnchor}\n    ...(complaintContext ? [complaintContext] : []),`;
  if (!source.includes(promptAnchor)) {
    throw new Error("complaint expected-field context: prompt anchor missing");
  }
  source = source.replace(promptAnchor, promptPatch);

  const callAnchor = `    const { decision, model } = await analyzeGuestAudio(wav.toString("base64"));`;
  const callPatch = `    const { decision, model } = await analyzeGuestAudio(\n      wav.toString("base64"),\n      complaintIntake,\n    );`;
  if (!source.includes(callAnchor)) {
    throw new Error("complaint expected-field context: analyze call missing");
  }
  source = source.replace(callAnchor, callPatch);

  fs.writeFileSync(path, source);
}

console.log("Applied complaint expected-field audio context");
