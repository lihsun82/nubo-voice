export function normalizeNuboVoiceText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/，/g, "")
    .replace(/。/g, "")
    .replace(/！/g, "")
    .replace(/!/g, "")
    .replace(/？/g, "")
    .replace(/\?/g, "")
    .toLowerCase();
}

const NAME_LIKE_KEYWORDS = [
  "政勲",
  "政勳",
  "玉娟",
  "承裕",
  "品研",
  "耀鳴",
  "耀明",
  "耀銘",
  "耀名",
  "耀鳴",
  "耀呈",
  "耀成",
  "曜呈",
  "曜成",
  "要成",
  "小魚",
  "魚均",
  "瑜君",
  "于君",
  "美樂",
  "美勒",
  "美了",
  "美樂",
];

const AMBIGUOUS_NAME_CHARS = [
  "政",
  "勲",
  "勳",
  "玉",
  "娟",
  "承",
  "裕",
  "品",
  "研",
  "耀",
  "曜",
  "鳴",
  "明",
  "銘",
  "呈",
  "成",
  "魚",
  "瑜",
  "君",
  "美",
  "樂",
  "勒",
];

const DEVICE_ACTION_WORDS = [
  "line",
  "開line",
  "開啟line",
  "打開line",
  "關line",
  "關閉line",
  "退出line",
  "靜音",
  "關閉",
  "關掉",
  "打開",
  "開啟",
];

export function isLikelyNameCallOrAmbiguousName(value: string): boolean {
  const text = normalizeNuboVoiceText(value);

  if (!text) return false;

  if (NAME_LIKE_KEYWORDS.some((keyword) => text.includes(normalizeNuboVoiceText(keyword)))) {
    return true;
  }

  // 兩到四個字、且含有人名常見字，優先當成人名，不當成電腦控制。
  if (text.length <= 4 && AMBIGUOUS_NAME_CHARS.some((char) => text.includes(char))) {
    return true;
  }

  // 語音把「耀明」誤聽成「要明 / 要名 / 要鳴」時，也不要拿去開關 LINE。
  if (text.length <= 5 && /要(明|名|鳴|銘|呈|成)/.test(text)) {
    return true;
  }

  // 只要同時像人名又像控制指令，安全起見不執行控制。
  const hasNameChar = AMBIGUOUS_NAME_CHARS.some((char) => text.includes(char));
  const hasDeviceAction = DEVICE_ACTION_WORDS.some((word) => text.includes(normalizeNuboVoiceText(word)));

  if (hasNameChar && hasDeviceAction) {
    return true;
  }

  return false;
}
