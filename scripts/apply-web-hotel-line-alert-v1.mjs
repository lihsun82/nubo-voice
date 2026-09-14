import fs from 'node:fs';

const marker = 'NUBO_HOTEL_LINE_ALERT_V2_COMPLAINT_THREE_FIELDS';
const toolsPath = 'lib/browser-nubo-tools-line.ts';
let tools = fs.readFileSync(toolsPath, 'utf8');

const legacyVoiceGuard = 'NUBO_COMPLETE_GUEST_INTAKE_V1：客訴／抱怨／客務建檔時，必須讓使用者把整段話說完並完成一個語音回合後，才可判斷資料是否完整。姓氏、房號、聯絡方式、實質客訴／需求內容四項缺一不可；「尚未提供客訴內容」「未提供」「待補」「不知道」「無」等佔位文字一律視為缺少客訴內容，禁止呼叫guest_service_alert。使用者仍在說話或句子尚未完成時，不得寄送郵件。';
const priorLineGuard = 'NUBO_HOTEL_LINE_ALERT_V1：客人把一個需求語音回合說完後，只要有實質需求內容即可立即通報LINE。毛巾、浴巾、備品、房務、設備異常與客訴都屬即時通報；姓氏、房號、聯絡方式為補充欄位，不得阻擋第一次LINE通知。';
const complaintGuard = `${marker}：旅客提出客訴／投訴／抱怨時，必須先收集三項資料：房號、姓氏、實質客訴內容。旅客已經說過的欄位不要重問，只補問缺少的欄位；聯絡方式不是必要欄位，不要主動詢問。三項未齊全前禁止呼叫guest_service_alert；三項齊全後立即送到LINE客務群組，不需要再問是否確認。毛巾、浴巾、備品、一般房務與非客訴型設備需求維持即時LINE，不受三欄規則阻擋。安全／緊急事件永遠優先立即通報。`;

if (tools.includes(legacyVoiceGuard)) {
  tools = tools.replace(legacyVoiceGuard, complaintGuard);
}
if (tools.includes(priorLineGuard)) {
  tools = tools.replace(priorLineGuard, complaintGuard);
}

const oldDescription = '"客人客訴或客務需求的正式升級工具。只有在已取得客人姓氏、房號、聯絡方式與完整客訴/需求內容四項資料後才可呼叫；呼叫後會立即通知現場管理者，不需一般郵件二次確認。"';
const priorDescription = '"客人備品、毛巾、房務、設備異常、客訴或其他需要現場處理的即時LINE升級工具。只要有實質需求內容就立即呼叫；房號、姓氏與聯絡方式有取得就帶入，缺少時不得阻擋LINE通知。"';
const newDescription = '"旅館現場客務LINE升級工具。一般備品／房務／設備需求有實質內容即可即時呼叫；若屬客訴／投訴／抱怨，必須先取得房號、姓氏、完整客訴內容三項後才可呼叫。客訴不要求聯絡方式。"';
if (tools.includes(oldDescription)) tools = tools.replace(oldDescription, newDescription);
if (tools.includes(priorDescription)) tools = tools.replace(priorDescription, newDescription);

tools = tools.replace(
  'required: ["surname", "roomNumber", "contact", "issue"],',
  'required: ["issue"],',
);

const legacyRules = '19. 客人提出客訴、抱怨、設備異常、清潔、噪音、退款帳務、遺失物、服務需求、特殊協助或任何需要現場人員介入的需求時，立即進入客務建檔流程。必須先取得四項資料：客人姓氏、房號、聯絡方式、客訴或需求內容。客人已經說過的資料不要重問，只補問缺少的欄位。\n20. 四項客務資料未齊全前禁止呼叫guest_service_alert，也禁止用一般gmail_prepare_send寄客訴通知。四項齊全後立即呼叫guest_service_alert，不需要再詢問客人是否確認寄出。\n21. 聯絡方式可接受手機、電話、LINE或其他可讓現場人員聯絡到客人的方式。若客人拒絕提供必要資料，清楚說明需要資料才能完成客務通報，不可自行捏造。\n22. guest_service_alert成功後，簡短告知客人「好的，已經幫您通知現場人員處理。」不得朗讀內部收件信箱。';
const priorRules = '19. NUBO_HOTEL_LINE_ALERT_V1：旅客提出毛巾、浴巾、備品、房務、設備異常、清潔、噪音、退款帳務、遺失物、客訴、抱怨或任何需要現場人員介入的需求時，只要已聽到實質需求內容，就立即呼叫guest_service_alert送到LINE客務群組。\n20. 房號、姓氏與聯絡方式有取得就帶入；缺少時可以自然補問，但不得因缺少這三項而阻擋第一次LINE即時通知，也不得改用一般gmail_prepare_send。\n21. 不得捏造房號、姓氏或聯絡方式；未知欄位留空即可。安全/緊急事件優先立即通報。\n22. guest_service_alert成功後，簡短告知客人「好的，已經幫您通知現場人員處理。」不得朗讀LINE群組ID或內部設定。';
const complaintRules = `19. ${marker}：旅客提出客訴、投訴或抱怨時，先確認三項資料：房號、姓氏、客訴內容。已取得的不要重問，只問缺少的欄位；不要詢問電話、手機或LINE等聯絡方式。\n20. 客訴三項資料未齊全前，禁止呼叫guest_service_alert，也不要提前送LINE；三項齊全後立即呼叫guest_service_alert，不需要再問旅客是否確認。\n21. 毛巾、浴巾、備品、一般房務、非客訴型設備需求仍維持即時LINE；安全／緊急事件也必須立即通報，不受客訴三欄規則延遲。\n22. guest_service_alert成功後，簡短告知旅客「好的，已經幫您通知現場人員處理。」不得朗讀LINE群組ID或內部設定。`;
if (tools.includes(legacyRules)) tools = tools.replace(legacyRules, complaintRules);
if (tools.includes(priorRules)) tools = tools.replace(priorRules, complaintRules);

tools = tools.replace(
  '- guest_service_alert是固定授權的客務升級通道，四項資料齊全後可直接執行，不適用一般寄信二次確認。',
  '- guest_service_alert是固定授權的LINE客務升級通道；一般客務可即時執行，客訴則必須等房號、姓氏、客訴內容三項齊全後才能執行。',
);
tools = tools.replace(
  '- guest_service_alert是固定授權的LINE客務升級通道，只要有實質旅客需求內容就可直接執行，不適用一般寄信二次確認。',
  '- guest_service_alert是固定授權的LINE客務升級通道；一般客務可即時執行，客訴則必須等房號、姓氏、客訴內容三項齊全後才能執行。',
);

if (!tools.includes(marker)) {
  throw new Error('hotel LINE alert: complaint three-field policy marker missing');
}
if (tools.includes('四項缺一不可') || tools.includes('四項客務資料未齊全')) {
  throw new Error('hotel LINE alert: legacy four-field complaint gate survived');
}

fs.writeFileSync(toolsPath, tools);
console.log('Applied complaint three-field intake + immediate non-complaint LINE behavior');
