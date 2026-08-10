export type NuboGuestServiceAlert = {
  matched: boolean;
  category:
    | "complaint"
    | "maintenance"
    | "housekeeping"
    | "amenity"
    | "frontdesk"
    | "billing"
    | "safety"
    | "general_request";
  urgency: "normal" | "high" | "critical";
  matchedKeywords: string[];
};

const CRITICAL_KEYWORDS = [
  "火災",
  "失火",
  "冒煙",
  "瓦斯",
  "漏電",
  "觸電",
  "受傷",
  "流血",
  "暈倒",
  "昏倒",
  "呼吸困難",
  "救護車",
  "警察",
  "被困",
  "困在",
  "暴力",
  "打架",
  "有人闖入",
  "門鎖打不開",
];

const COMPLAINT_KEYWORDS = [
  "客訴",
  "投訴",
  "抱怨",
  "不滿",
  "很生氣",
  "太誇張",
  "服務很差",
  "態度很差",
  "太吵",
  "吵死",
  "很髒",
  "髒死",
  "有異味",
  "很臭",
  "蟑螂",
  "跳蚤",
  "床蝨",
  "蚊蟲",
  "沒處理",
  "一直沒處理",
  "等太久",
  "騙人",
  "不合理",
];

const MAINTENANCE_KEYWORDS = [
  "壞了",
  "壞掉",
  "不能用",
  "沒反應",
  "故障",
  "漏水",
  "淹水",
  "沒熱水",
  "沒有熱水",
  "冷氣不冷",
  "冷氣壞",
  "空調壞",
  "電視壞",
  "遙控器壞",
  "wifi不能用",
  "wifi壞",
  "網路不能用",
  "插座壞",
  "燈壞",
  "馬桶堵",
  "馬桶壞",
  "免治壞",
  "門鎖壞",
  "房門打不開",
  "維修",
];

const HOUSEKEEPING_KEYWORDS = [
  "打掃",
  "清潔",
  "整理房間",
  "換床單",
  "床單",
  "被單",
  "垃圾",
  "倒垃圾",
  "補房",
  "房務",
];

const AMENITY_KEYWORDS = [
  "毛巾",
  "浴巾",
  "衛生紙",
  "牙刷",
  "牙膏",
  "刮鬍刀",
  "拖鞋",
  "礦泉水",
  "瓶水",
  "飲用水",
  "枕頭",
  "棉被",
  "被子",
  "吹風機",
  "衣架",
  "備品",
  "充電器",
  "轉接頭",
];

const FRONTDESK_KEYWORDS = [
  "換房",
  "換房間",
  "加床",
  "加人",
  "延遲退房",
  "延後退房",
  "提早入住",
  "提前入住",
  "入住問題",
  "退房問題",
  "行李寄放",
  "寄放行李",
  "叫車",
  "計程車",
  "櫃檯",
  "找人處理",
  "請人過來",
  "請人來",
  "送到房間",
  "房卡",
  "鑰匙卡",
  "門卡",
  "遺失物",
  "東西不見",
  "忘記東西",
];

const BILLING_KEYWORDS = [
  "退款",
  "退費",
  "退錢",
  "多收",
  "重複扣款",
  "刷卡問題",
  "付款問題",
  "發票問題",
  "收據",
  "押金",
  "價格不對",
  "房價不對",
];

const HOTEL_CONTEXT_KEYWORDS = [
  "房間",
  "房號",
  "客房",
  "住宿",
  "旅館",
  "飯店",
  "酒店",
  "入住",
  "退房",
  "櫃檯",
  "房務",
  "房卡",
  "門卡",
  "床",
  "浴室",
  "廁所",
  "冷氣",
  "空調",
  "電視",
  "熱水",
  "毛巾",
  "浴巾",
  "備品",
];

const REQUEST_PHRASES = [
  "我要",
  "我需要",
  "需要",
  "麻煩",
  "請幫我",
  "幫我",
  "可以幫我",
  "能不能",
  "可不可以",
  "請問可以",
  "請處理",
  "幫忙處理",
  "請送",
  "送一個",
  "送兩個",
  "再給我",
  "補一個",
  "補一些",
];

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？、,.!?]/g, "");
}

function matchedKeywords(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(normalize(keyword)));
}

export function classifyNuboGuestServiceTranscript(
  transcript: string,
): NuboGuestServiceAlert {
  const text = normalize(transcript);

  const critical = matchedKeywords(text, CRITICAL_KEYWORDS);
  if (critical.length) {
    return {
      matched: true,
      category: "safety",
      urgency: "critical",
      matchedKeywords: critical,
    };
  }

  const complaint = matchedKeywords(text, COMPLAINT_KEYWORDS);
  if (complaint.length) {
    return {
      matched: true,
      category: "complaint",
      urgency: "high",
      matchedKeywords: complaint,
    };
  }

  const maintenance = matchedKeywords(text, MAINTENANCE_KEYWORDS);
  if (maintenance.length) {
    return {
      matched: true,
      category: "maintenance",
      urgency: "high",
      matchedKeywords: maintenance,
    };
  }

  const housekeeping = matchedKeywords(text, HOUSEKEEPING_KEYWORDS);
  if (housekeeping.length) {
    return {
      matched: true,
      category: "housekeeping",
      urgency: "normal",
      matchedKeywords: housekeeping,
    };
  }

  const amenity = matchedKeywords(text, AMENITY_KEYWORDS);
  if (amenity.length) {
    return {
      matched: true,
      category: "amenity",
      urgency: "normal",
      matchedKeywords: amenity,
    };
  }

  const billing = matchedKeywords(text, BILLING_KEYWORDS);
  if (billing.length) {
    return {
      matched: true,
      category: "billing",
      urgency: "high",
      matchedKeywords: billing,
    };
  }

  const frontdesk = matchedKeywords(text, FRONTDESK_KEYWORDS);
  if (frontdesk.length) {
    return {
      matched: true,
      category: "frontdesk",
      urgency: "normal",
      matchedKeywords: frontdesk,
    };
  }

  const request = matchedKeywords(text, REQUEST_PHRASES);
  const hotelContext = matchedKeywords(text, HOTEL_CONTEXT_KEYWORDS);
  if (request.length && hotelContext.length) {
    return {
      matched: true,
      category: "general_request",
      urgency: "normal",
      matchedKeywords: [...request, ...hotelContext].slice(0, 8),
    };
  }

  return {
    matched: false,
    category: "general_request",
    urgency: "normal",
    matchedKeywords: [],
  };
}

export function getNuboGuestServiceCategoryLabel(
  category: NuboGuestServiceAlert["category"],
) {
  return {
    complaint: "客訴/抱怨",
    maintenance: "設備/維修",
    housekeeping: "房務/清潔",
    amenity: "備品/物品需求",
    frontdesk: "櫃檯/住宿需求",
    billing: "付款/退款/帳務",
    safety: "安全/緊急事件",
    general_request: "一般客人需求",
  }[category];
}
