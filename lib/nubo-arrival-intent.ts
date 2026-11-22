export type NuboArrivalIntent = "checkin" | "booking" | "lodging";

const CHECK_IN_PATTERNS: RegExp[] = [
  /入住|入住房間|辦理入住|办理入住|登記入住|登记入住|住店/u,
  /\bcheck[ -]?in\b|\bchecking[ -]?in\b|\bcheck into (?:the )?hotel\b/iu,
  /チェックイン|宿泊手続き|入館手続き/u,
  /체크인|입실|숙박 수속/u,
  /เช็คอิน|เช็กอิน|เข้าพัก/u,
  /nhận phòng|làm thủ tục nhận phòng/iu,
  /daftar masuk|masuk kamar|masuk bilik/iu,
  /registrarse(?: en el hotel)?|registro de entrada|hacer el check.?in/iu,
  /enregistrement(?: à l.hôtel)?|arrivée à l.hôtel/iu,
  /einchecken|einchecken|anreise im hotel/iu,
  /fare il check.?in|registrazione in hotel/iu,
  /inchecken|inchecken bij het hotel/iu,
  /fazer (?:o )?check.?in|entrada no hotel/iu,
  /засел(?:иться|ение|яемся)|регистрация заезда/iu,
  /تسجيل الوصول|تسجيل الدخول إلى الفندق/u,
  /चेक[ -]?इन|होटल में प्रवेश/u,
  /giriş yapmak|otele giriş/iu,
  /mag.?check.?in|pag.?check.?in/iu,
];

const BOOKING_PATTERNS: RegExp[] = [
  /訂房|订房|訂(?:一|個|间|間)?房|订(?:一|个|间)?房|預訂房間|预订房间|預約房間|预约房间|訂酒店|订酒店/u,
  /\bbook(?:ing)?\s+(?:a\s+|the\s+)?(?:hotel\s+)?room\b|\bmake\s+(?:a\s+)?booking\b|\bbooking\b|\breserv(?:e|ation|ations)\b|\broom reservation\b/iu,
  /(?:部屋|ホテル|宿泊).{0,5}予約|予約.{0,5}(?:部屋|ホテル|宿泊)/u,
  /(?:객실|호텔|숙박).{0,5}예약|예약.{0,5}(?:객실|호텔|숙박)/u,
  /จองห้องพัก|จองโรงแรม/u,
  /đặt phòng|đặt khách sạn/iu,
  /pesan kamar|tempah bilik|tempah hotel/iu,
  /reservar (?:una )?habitación|reserva de habitación/iu,
  /réserver une chambre|réservation de chambre/iu,
  /zimmer buchen|zimmer reservieren|hotelzimmer buchen/iu,
  /prenotare una camera|prenotazione camera/iu,
  /quarto reservar|reservar (?:um )?quarto/iu,
  /забронировать номер|бронирование номера/iu,
  /حجز غرفة|حجز فندق/u,
  /कमरा बुक|कमरे की बुकिंग/u,
  /oda rezervasyonu|oda ayırtmak/iu,
];

const LODGING_PATTERNS: RegExp[] = [
  /(?:我要|我想|想要|需要|打算|準備|准备|可以|能不能).{0,8}(?:住宿|住一晚|住幾晚|住几晚)/u,
  /(?:住宿|住一晚).{0,6}(?:有沒有|有没有|可以嗎|可以吗|怎麼辦|怎么办)/u,
  /\b(?:i|we) (?:want|need|would like) to stay\b|\blooking for (?:a place|somewhere) to stay\b/iu,
];

const CANCELLATION_PATTERNS: RegExp[] = [
  /取消.{0,8}(?:入住|住宿|訂房|订房|預訂|预订|預約|预约)|不(?:想|要|用|打算).{0,6}(?:入住|住宿|訂房|订房)/u,
  /\b(?:cancel|cancellation|cancelar|annuler|stornieren|annuleren)\b/iu,
  /キャンセル|취소|ยกเลิก|hủy|huỷ|batalkan|отмен|إلغاء|रद्द/u,
];

export function isNuboArrivalCancellation(value: string) {
  const text = value.normalize("NFKC").trim().toLowerCase();
  return CANCELLATION_PATTERNS.some((pattern) => pattern.test(text));
}

// A room-availability question is not permission to start a booking handoff.
// Keep explicit booking or check-in requests on the existing fast notification path.
export function isNuboAvailabilityOnlyQuestion(value: string) {
  const text = value.normalize("NFKC").trim().toLowerCase().replace(/[\\s　]+/g, " ");
  const explicitRequest = /(?:幫我|帮我|請幫我|请帮我|麻煩幫我|麻烦帮我|我要|我想要|我需要|我們要|我们要).{0,12}(?:辦理入住|办理入住|訂房|订房|預訂|预订|住宿|住一晚)/u;
  if (explicitRequest.test(text)) return false;
  const roomAvailability = /(?:有沒有|有没有|還有|还有|空房|可售|剩幾|剩几|剩多少).{0,12}(?:房|入住|住宿|休息)|(?:可以|能不能|可不可以).{0,8}(?:訂房|订房|入住)|(?:訂房|订房|入住).{0,4}(?:嗎|吗|呢|\\?|？)/u;
  const question = /(?:請問|请问|想問|想问|\\?|？|嗎|吗|有沒有|有没有|還有|还有|幾間|几间|多少間|多少间|可不可以|能不能)/u;
  if (roomAvailability.test(text) && question.test(text)) return true;
  return /^(?:can|could|may|do|does|is|are)\\b.*(?:book|check[ -]?in|rooms? available|vacanc)/iu.test(text);
}

export function classifyNuboArrivalIntent(value: string): NuboArrivalIntent | null {
  const text = value.normalize("NFKC").trim().toLowerCase().replace(/[\s　]+/g, " ");
  if (!text || isNuboArrivalCancellation(text) || isNuboAvailabilityOnlyQuestion(text)) return null;
  if (CHECK_IN_PATTERNS.some((pattern) => pattern.test(text))) return "checkin";
  if (BOOKING_PATTERNS.some((pattern) => pattern.test(text))) return "booking";
  if (LODGING_PATTERNS.some((pattern) => pattern.test(text))) return "lodging";
  return null;
}
