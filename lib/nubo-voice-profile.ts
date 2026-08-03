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

export const NUBO_HOTEL_CORE_INSTRUCTION = `${BASE_NUBO_HOTEL_CORE_INSTRUCTION}\n\n${NUBO_HOTEL_PARKING_INSTRUCTION}`.trim();

export function getNuboPersonalityInstruction(
  personality: BaseNuboPersonalityId,
) {
  return `${getBaseNuboPersonalityInstruction(personality)}\n\n${NUBO_HOTEL_PARKING_INSTRUCTION}`.trim();
}
