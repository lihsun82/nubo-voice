import { NUBO_JINXIN_LOCAL_GUIDE } from "./nubo-jinxin-local-guide";
/**
 * AINUBO HOTEL 台中錦新館：館方於 2026-11-23 提供之房型／房價截圖。
 * 不是即時訂房報價、庫存或官網爬取結果。
 * 官網 https://ainubohotels.com/ 當次無法直接讀取；不得虛稱已驗證網站內容。
 */
export const JINXIN_ROOM_RATES = [
  {code:"CD",name:"智享雙人房",weekday:1880,friday:2280,saturday:2780,sunday:1980},
  {code:"CT",name:"智享雙床房",weekday:1880,friday:2280,saturday:2780,sunday:1980},
  {code:"CK",name:"智享寬床雙人房",weekday:2080,friday:2480,saturday:2980,sunday:2180},
  {code:"PD",name:"智選雙人房",weekday:1980,friday:2380,saturday:2880,sunday:2080},
  {code:"PT",name:"智選雙床房",weekday:1980,friday:2380,saturday:2780,sunday:2080},
  {code:"PK",name:"智選寬床雙人房",weekday:2180,friday:2580,saturday:3080,sunday:2280},
  {code:"PS",name:"智選單人房",weekday:1580,friday:1780,saturday:2080,sunday:1680},
  {code:"RD",name:"臻選雙人房",weekday:2080,friday:2480,saturday:2980,sunday:2180},
  {code:"RT",name:"臻選雙床房",weekday:2080,friday:2480,saturday:2980,sunday:2180},
  {code:"RK",name:"臻選寬床雙人房",weekday:2280,friday:2680,saturday:3180,sunday:2380},
  {code:"NF",name:"星域閣樓家庭四人房",weekday:3280,friday:3680,saturday:4280,sunday:3480},
  {code:"NV",name:"星曜閣樓景觀家庭房",weekday:3480,friday:3880,saturday:4580,sunday:3680},
] as const;

/**
 * 館方直接確認的錦新館聯絡資料，2026-11-24。
 * 公開提供給旅客；不代表官網所有其他資料已驗證。
 */
export const NUBO_JINXIN_CONTACT = {
  name: "AINUBO HOTEL 新寶智慧酒店 台中錦新館",
  address: "台中市北區錦新街18號",
  phone: "04-22231157",
  email: "hello@ainubohotels.com",
} as const;

export const NUBO_JINXIN_REFERENCE = `

【館方最新確認的基本聯絡資訊（2026-11-24）】
- 正式名稱：${NUBO_JINXIN_CONTACT.name}
- 館址：${NUBO_JINXIN_CONTACT.address}
- 服務專線：${NUBO_JINXIN_CONTACT.phone}（連續數字 0422231157；唸成「零四、二二二三、一一五七」，不可增減、改成其他分館電話）
- 公司／官方聯絡信箱：${NUBO_JINXIN_CONTACT.email}（完整地址必須準確；可用英文逐字拼讀）
- 旅客詢問「飯店在哪裡」、「地址」、「導航目的地」、「聯絡電話」、「櫃檯電話」、「客服電話」、「公司 Email」、「如何聯絡飯店」時，可以直接回答這三項館方已確認的資訊，不必重新查房況或詢問入住日期。
- 旅客要求打電話或寄信時，僅提供號碼及信箱，除非已確實啟用且成功執行相應工具，否則不可宣稱已撥通電話、已寄出郵件或已通知櫃檯。
AINUBO HOTEL 新寶智慧酒店｜台中錦新館館方基礎資料（館方 2026-11-23 截圖，非官網或 PMS 即時資料）：
- 地址：台中市北區錦新街18號。對外官網網址 https://ainubohotels.com/；目前未能在線上完整驗證官網所有頁面，不得冒稱已核對。
- 房價為新臺幣每房每晚的「館方價格表參考價」，須先知道入住日期、退房日期、房型和人數才可對應星期；特殊日、連假、旺季、方案與動態調價可能不同。
- 表格以「週一到週四／週五／週六／週日」四價排列：
CD 智享雙人房 1880／2280／2780／1980
CT 智享雙床房 1880／2280／2780／1980
CK 智享寬床雙人房 2080／2480／2980／2180
PD 智選雙人房 1980／2380／2880／2080
PT 智選雙床房 1980／2380／2780／2080
PK 智選寬床雙人房 2180／2580／3080／2280
PS 智選單人房 1580／1780／2080／1680
RD 臻選雙人房 2080／2480／2980／2180
RT 臻選雙床房 2080／2480／2980／2180
RK 臻選寬床雙人房 2280／2680／3180／2380
NF 星域閣樓家庭四人房 3280／3680／4280／3480
NV 星曜閣樓景觀家庭房 3480／3880／4580／3680。
- 不得混淆房型代碼或沿用舊房價。截圖週日價旁寫「已含」，其意義不明，不可自行解釋成含早餐、服務費或稅金。
- 以上只能回答「公開館方價目表參考價」，不是最新可訂價；客人要真正訂房或詢問有沒有房，仍先呼叫 PMS 當次即時查詢，房價以實際訂房頁／人員確認為準。查房失敗不代表客滿。
- 館方先前提供入住時間16:00、退房時間11:00；提前入住／延後退房原則每小時300元，依房況與當日館方規定確認；這是內部既有資料，應優先比對最新官網後再對外確答。
- 交通：由臺中車站可搭臺中市公車 5 路到「國立臺中科技大學」或「中友百貨」附近，再步行前往錦新街18號。臺中市官方公車路線查詢也顯示132路經過「三民錦新街口」、「中友百貨」、「國立臺中科技大學」及「臺中車站」，可依旅客起點推薦。路線、站位、發車時間與步行距離必須依當日官方公車／地圖查詢，不可杜撰分鐘數。
- 飯店沒有自有館內停車場；車位、合作停車費、進出規則可能變動，需事先向館方或現場公告確認。舊品牌網站的停車場介紹不等於新寶當前的特約方案。
- 只服務台中錦新館，勿將舊品牌「雀客快捷台中一中」的房型或規則當成新寶的現行規則。

${NUBO_JINXIN_LOCAL_GUIDE}
`.trim();
