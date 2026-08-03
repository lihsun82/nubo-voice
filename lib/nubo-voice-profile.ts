import {
  NUBO_HOTEL_CORE_INSTRUCTION as BASE_NUBO_HOTEL_CORE_INSTRUCTION,
  getNuboPersonalityInstruction as getBaseNuboPersonalityInstruction,
} from "./nubo-voice-profile-base";
import type {
  NuboPersonalityId as BaseNuboPersonalityId,
} from "./nubo-voice-profile-base";

export type {
  GeminiVoiceName,
  NuboPersonalityId,
  NuboVoiceEngine,
  NuboVoiceGender,
  NuboVoiceName,
  NuboVoiceOption,
  NuboVoiceProfile,
  OpenAIVoiceName,
} from "./nubo-voice-profile-base";

export {
  NUBO_DEFAULT_VOICE_PROFILE,
  NUBO_ENGINE_OPTIONS,
  NUBO_GEMINI_VOICES,
  NUBO_MODE_PRESETS,
  NUBO_OPENAI_VOICES,
  NUBO_PERSONALITY_OPTIONS,
  NUBO_VOICE_PROFILE_EVENT,
  NUBO_VOICE_PROFILE_STORAGE_KEY,
  getNuboProfileLabel,
  getNuboVoiceOption,
  normalizeNuboVoiceProfile,
  readNuboVoiceProfile,
  saveNuboVoiceProfile,
} from "./nubo-voice-profile-base";

export const NUBO_HOTEL_PARKING_INSTRUCTION = `
停車服務：
- AINUBO Hotel 備有 5 個平面車位。
- 車位數量有限。是否有空位、是否收費、預約方式、進出時間、車高與車型限制，必須以訂房系統或現場當日確認為準，不得自行保證一定有車位。
- 旅客詢問停車時，先清楚說明館方共有 5 個平面車位，再主動協助確認入住日期、車輛數量與當日可用狀況。
- 未取得即時確認前，不得使用「已保留」「一定可以停」「免費停車」等承諾性說法。
`;

export const NUBO_HOTEL_PRICING_DATE_INSTRUCTION = `
飯店專業報價與日期規則：
- 所有「今天、明天、後天」必須依 Asia/Taipei 台灣時間與實際 check-in date 重新計算，不得直接相信來源檔案內已寫好的相對日期名稱。
- 每次報價都優先說出明確入住日期；跨午夜後，昨天的入住日不得再稱為今天，也不得對旅客播報已過去日期的房價。
- GitHub 價格雷達提供的是周邊市場行情、競品價格與建議售價，不等於 AINUBO Hotel 可立即下訂的實際成交價。
- 只有工具結果 quoteEligible=true 且 stale=false 時，才能把資料稱為目前可參考的市場行情；仍須清楚標示這是市場建議，不是已確認訂房價格。
- 工具回傳 stale=true、currentDateCovered=false、actualBookableRateConfirmed=false，或更新時間無法確認時，不得使用「今天房價就是」「目前確定價格」「已確認有房」等肯定說法。
- 旅客詢問本館實際價格時，應先確認入住日、退房日、人數與房型，再查訂房系統或轉交現場；未串接 PMS／訂房引擎前，不得用市場建議價冒充本館售價。
- 過期行情仍可作為內部歷史參考，但必須先說明確切資料日期與限制，不得當作當日對客報價。
`;

export const NUBO_HOTEL_CORE_INSTRUCTION = `${BASE_NUBO_HOTEL_CORE_INSTRUCTION}\n\n${NUBO_HOTEL_PARKING_INSTRUCTION}\n\n${NUBO_HOTEL_PRICING_DATE_INSTRUCTION}`.trim();

export function getNuboPersonalityInstruction(
  personality: BaseNuboPersonalityId,
) {
  return `${getBaseNuboPersonalityInstruction(personality)}\n\n${NUBO_HOTEL_PARKING_INSTRUCTION}\n\n${NUBO_HOTEL_PRICING_DATE_INSTRUCTION}`.trim();
}
