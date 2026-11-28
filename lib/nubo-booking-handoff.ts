import { JINXIN_ROOM_RATES } from "./nubo-jinxin-reference.ts";
import { floorsForRequiredAmenities, hasPmsFloorScope } from "./pms-facility-floors.ts";

export const GUEST_KIOSK_URL = "https://nubosci.ainubohub.com/#/standby";
type Purpose = "stay" | "rest" | "existing";
type Fields = Record<string, unknown>;
type Offer = { roomCode: string; roomName: string; referenceTwd: number | null };
const DAY = 86_400_000;

export function inventoryPurpose(toolName?: string) {
  if (toolName === "pms_check_availability") return "stay";
  if (toolName === "pms_check_rest_availability") return "rest";
  return null;
}

function stayReference(code: string, name: string, checkIn: unknown, checkOut: unknown) {
  const rate = JINXIN_ROOM_RATES.find(room => room.code === code && room.name === name);
  if (!rate || typeof checkIn !== "string" || typeof checkOut !== "string") return null;
  const start = Date.parse(checkIn), end = Date.parse(checkOut);
  const nights = (end - start) / DAY;
  if (!Number.isInteger(nights) || nights < 1 || nights > 31) return null;
  let total = 0;
  for (let night = start; night < end; night += DAY) {
    const weekday = new Date(night).getUTCDay();
    total += [rate.sunday, rate.weekday, rate.weekday, rate.weekday, rate.weekday, rate.friday, rate.saturday][weekday];
  }
  return total;
}

export function availableBookingOffers(purpose: "stay" | "rest", args: Fields, result: Fields): Offer[] {
  const age = Date.now() - Date.parse(String(result.asOf));
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000 || result.contactCardShown === true) return [];
  const floors = floorsForRequiredAmenities(args.requiredAmenities);
  if (!floors || (floors.length ? !hasPmsFloorScope(result, floors) : result.inventoryView !== "guest-room-types-v1") ||
      !Array.isArray(result.roomTypes) || result.ok === false) return [];
  if (purpose === "stay" && (result.covered !== true || result.source !== "live")) return [];
  if (purpose === "rest" && (typeof result.startAt !== "string" || result.durationMinutes !== Number(args.durationMinutes))) return [];
  return result.roomTypes.flatMap(room => {
    if (!room || typeof room.name !== "string" || typeof room.code !== "string" ||
        !Number.isInteger(room.availableCount) || room.availableCount < 1) return [];
    const referenceTwd = purpose === "stay" ? stayReference(room.code, room.name, args.checkIn, args.checkOut)
      : result.durationMinutes === 180 ? 890 : null;
    return [{ roomCode: room.code, roomName: room.name, referenceTwd }];
  });
}

export const BOOKING_HANDOFF_TOOL = {
  name: "guide_guest_booking",
  description: "安排旅客自助分頁。已在 OTA 或本館訂妥選 existing；新訂或休息須選本輪 PMS 回傳的可售房型。工具不建立訂單或扣款。",
  parameters: {
    type: "OBJECT",
    properties: {
      purpose: { type: "STRING", enum: ["stay", "rest", "existing"] },
      roomCode: { type: "STRING", description: "新訂或休息時本次已核對可售、符合需求的房型碼。已預訂免填。" },
    },
    required: ["purpose"],
  },
};

export const BOOKING_FLOW = `錦新館接待分流：
已在 OTA（如 Agoda、Booking.com）或館方訂妥，直接協助原訂單：呼叫 guide_guest_booking(purpose=existing)，引導使用本館入住 QR 或確認信編號；第三方編號查不到就聯絡飯店核對，勿重訂。已預付勿再付全額，未付或部分付款只依已核對的原訂單尾款。
要現場住宿或休息且尚未訂房：取得必要條件就查相應 PMS。只從本次 bookingOffers 選符合人數、日期與設備的可售房型。住宿 referenceTwd 為每房整段住宿的館方參考總價，休息為該時段參考價；空值請說房價待飯店確認。查房回傳 handoff=after_spoken_quote 時，系統已排好自動開頁。直接說符合的房型、參考總價及下一步，說完系統自行開頁。毋須再呼叫工具、詢問要不要開頁或等旅客同意。要帶旅客回到原訂單才呼叫 guide_guest_booking(existing)。若客人已經在頁面、只要資訊或不要開頁，查房時傳 navigation=information_only。旅客只問價目、明說不要開頁、沒有符合需求的房、團體需人工報價、或已經在網頁上操作時，不要自動開。勿用 open_website 代替。
休息查詢回傳 cross_midnight_rest_needs_confirmation 時，照結果報已知三小時方案價，再請旅客用 NUBO 右上角聯絡卡或自助頁「客服協助」核對這段時間。這是時段尚未確認；不可說客滿、停賣或改用隔天的房況。
若是現有自助頁，住宿按「現場訂房」、短休按「休息」，顯示洽櫃檯就按「客服協助」聯絡；說明目前該頁可辦理到哪裡。若確為館方正式訂房頁，依旅客看到的日期、房型、金額與付款方式一次帶一步；付款由本人在正式頁確認，不口述卡號或驗證碼。畫面尚未顯示付款成功或訂單成立就不要宣稱完成。若沒跳出來，可點 NUBO 的訂房／入住連結。不要宣稱看到另一個分頁。`;

// Speech-to-text may write prices in local digits, words or Chinese numerals.
function quotedOffer(text: string, offers: Offer[]) {
  const line = text.normalize("NFKC").toLowerCase().replace(/[ ,，.]/g, "");
  if (!line || /換個日期|要不要改|要改成|願意改|換成.+嗎|wouldyou(?:prefer|consider)an?alternative/i.test(line)) return false;
  const currency = /元|圓|圜|円|塊|块|台幣|臺幣|twd|nt\$|dollars?|đài tệ|đôla|대만달러|대만달라|台湾ドル|バーツ|ดอลลาร์|달러/u;
  const digits = line.replace(/[零〇一二兩三四五六七八九十百千萬]+/gu, word => {
    let total = 0, group = 0, value = 0;
    const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000 };
    for (const ch of word.replaceAll("兩","二").replaceAll("〇","零")) {
      if (ch === "萬") { total += (group + value || 1) * 10000; group = value = 0; }
      else if (units[ch]) { group += (value || 1) * units[ch]; value = 0; }
      else value = value * 10 + "零一二三四五六七八九".indexOf(ch);
    }
    return String(total + group + value);
  });
  const amounts = new Set(digits.match(/\d+/gu) ?? []);
  return offers.some(offer => offer.referenceTwd !== null && amounts.has(String(offer.referenceTwd))) ||
    (currency.test(line) && offers.some(offer => line.includes(offer.roomName))) ||
    (offers.some(offer => offer.referenceTwd === null && line.includes(offer.roomName)) && /確認|核對/u.test(line)) ||
    (!/[\p{Script=Han}]/u.test(line) && currency.test(text.toLowerCase()) && offers.some(offer => offer.referenceTwd !== null));
}

function informationOnly(text: string) {
  return /(?:不要|不想|不用|別|不必).{0,7}(?:跳|開|訂房頁)|只(?:是)?(?:想|要)?(?:問價|詢價|看價|比價)|(?:已經|正在|目前|我在).{0,8}(?:自助頁|訂房頁|訂房網頁)|(?:只|就)看(?:看)?價|price.only|just (?:checking|comparing) prices|do(?:n.t| not) open|already on (?:the|this) (?:page|site)|料金だけ|開かないで|すでに.{0,6}画面|가격만|열지 마|chỉ (?:hỏi|xem) giá|đừng mở/iu.test(text);
}

function describesExistingReservation(words: string) {
  const text = words.normalize("NFKC").toLowerCase();
  if (/如果|假如|假設|還沒|尚未|沒有(?:在.{0,16})?(?:訂|預)|取消|まだ予約|予約していません|예약하지|chưa đặt|cancelled|canceled|haven.t booked|if i (?:have|had|book)/iu.test(text)) return false;
  return /(?:已經?|早就|之前|事先).{0,20}(?:[訂订]好|預[訂定約]|[訂订]了|[訂订]過|有[訂预]單)|(?:我有|我有一[筆張個]).{0,10}(?:訂單|預訂|入住碼)|(?:agoda|booking\.?com|expedia|ota).{0,12}(?:[訂订]好|[訂订]了|已付|付清)|(?:i|we) (?:already (?:have|booked|paid)|(?:have|'ve) (?:a reservation|booked|paid))|(?:予約済み|予約しました|予約しています)|예약(?:했|되어)|(?:tôi|mình) đã (?:đặt|thanh toán)/iu.test(text);
}

const existingBookingStep = /qr|入住碼|訂單編號|預訂編號|booking (?:number|reference)|reservation (?:number|code)|予約番号|예약 번호|mã (?:đặt phòng|nhận phòng)/iu;

// One controller per guest call. A superseded lookup or interrupted reply must never navigate later.
export class GuestBookingHandoff {
  private revision = 0;
  private latest: { purpose: Purpose; offers: Offer[]; asOf: number } | null = null;
  private pending: { url: string; spoken: boolean; ended: boolean; offers: Offer[]; stepSpoken: boolean; existing: boolean } | null = null;
  private guestWords = "";
  private replyWords = "";
  private suppressPage = false;
  private playing = false;
  private attempted = new Set<string>();

  private readonly open: (url: string) => boolean;
  private readonly show: (url: string, blocked: boolean) => void;

  constructor(open: (url: string) => boolean, show: (url: string, blocked: boolean) => void) {
    this.open = open;
    this.show = show;
  }

  reset() {
    this.invalidate();
    this.attempted.clear();
    this.guestWords = "";
    this.suppressPage = false;
    this.playing = false;
  }

  invalidate() {
    this.latest = null;
    this.replyWords = "";
    this.pending = null;
    return ++this.revision;
  }

  interrupt() { this.pending = null; this.replyWords = ""; }

  guestTurn() {
    this.interrupt();
    ++this.revision;
    this.guestWords = "";
    this.suppressPage = false;
  }

  guestTranscript(words: string) {
    this.guestWords = words.startsWith(this.guestWords) ? words : this.guestWords + words;
    if (informationOnly(this.guestWords)) { this.suppressPage = true; this.interrupt(); }
  }

  replyTranscript(words: string) {
    if (!this.pending && !this.suppressPage && !this.attempted.has(GUEST_KIOSK_URL) && describesExistingReservation(this.guestWords)) {
      this.arm(GUEST_KIOSK_URL, [], true);
    }
    if (!this.pending) return;
    this.replyWords += words;
    this.pending.stepSpoken = this.pending.existing ? existingBookingStep.test(this.replyWords)
      : quotedOffer(this.replyWords, this.pending.offers);
  }

  inventory(revision: number, purpose: "stay" | "rest", args: Fields, result: Fields, stayBookingUrl: string | null = null) {
    if (revision !== this.revision) return { ok: false, reason: "lookup_superseded", bookingOffers: [] };
    const offers = availableBookingOffers(purpose, args, result);
    this.latest = { purpose, offers, asOf: Date.parse(String(result.asOf)) };
    if (args.navigation === "information_only") this.suppressPage = true;
    if (!offers.length || this.suppressPage) return { ...result, bookingOffers: offers, handoff: "none" };
    const url = purpose === "stay" && stayBookingUrl ? stayBookingUrl : GUEST_KIOSK_URL;
    this.arm(url, offers);
    return { ...result, bookingOffers: offers, handoff: this.pending ? "after_spoken_quote" : "link_already_offered",
      destination: this.destination(url),
      nextAction: "Speak one suitable available room and its reference price now. Automatic navigation is scheduled after your spoken offer. Give one next step for the destination. Do not ask whether to open or call another tool to open it." };
  }

  request(args: Fields, stayBookingUrl: string | null) {
    const purpose = args.purpose;
    if (purpose !== "existing" && purpose !== "stay" && purpose !== "rest") return { ok: false };
    if (purpose !== "existing") {
      const latest = this.latest;
      const age = latest ? Date.now() - latest.asOf : NaN;
      if (!latest || !Number.isFinite(age) || age > 300_000 || age < -60_000 || latest.purpose !== purpose ||
          !latest.offers.some(room => room.roomCode === args.roomCode)) return { ok: false, reason: "matching_live_offer_required" };
    } else {
      this.invalidate();
    }
    const url = purpose === "stay" && stayBookingUrl ? stayBookingUrl : GUEST_KIOSK_URL;
    if (this.suppressPage) return { ok: false, reason: "guest_requested_information_only" };
    if (!this.attempted.has(url)) {
      if (purpose === "existing") this.launch(url);
      else this.arm(url, this.latest!.offers.filter(offer => offer.roomCode === args.roomCode));
    }
    return { ok: true, destination: this.destination(url), pageLinkAvailable: true };
  }

  private destination(url: string) {
    const destination = new URL(url);
    return destination.origin === new URL(GUEST_KIOSK_URL).origin && destination.pathname === "/"
      ? "self_service_kiosk" : "hotel_booking_page";
  }

  private arm(url: string, offers: Offer[], existing = false) {
    if (this.attempted.has(url) || this.pending?.url === url) return;
    this.show(url, false);
    this.replyWords = "";
    this.pending = { url, spoken: false, ended: false, offers, stepSpoken: false, existing };
  }

  spoken() { if (this.pending) this.pending.spoken = true; this.flush(); }
  endReply() {
    if (this.pending?.stepSpoken) this.pending.ended = true;
    this.flush();
  }
  playback(active: boolean) { this.playing = active; if (!active) this.flush(); }
  manual(url: string) { this.pending = null; this.attempted.add(url); }

  private flush() {
    if (this.pending?.ended && this.pending.spoken && this.pending.stepSpoken && !this.playing) this.launch(this.pending.url);
  }
  private launch(url: string) {
    this.pending = null;
    this.attempted.add(url);
    this.show(url, !this.open(url));
  }
}
