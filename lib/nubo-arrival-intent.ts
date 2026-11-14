export type NuboArrivalIntent = "checkin" | "booking";

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
  /\bbook(?:ing)?\b|\breserv(?:e|ation|ations)\b|\broom reservation\b/iu,
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

const CANCELLATION_PATTERNS: RegExp[] = [
  /取消.{0,8}(?:入住|訂房|订房|預訂|预订|預約|预约)|不(?:想|要|用|打算).{0,6}(?:入住|訂房|订房)/u,
  /\b(?:cancel|cancellation|cancelar|annuler|stornieren|annuleren)\b/iu,
  /キャンセル|취소|ยกเลิก|hủy|huỷ|batalkan|отмен|إلغاء|रद्द/u,
];

export function isNuboArrivalCancellation(value: string) {
  const text = value.normalize("NFKC").trim().toLowerCase();
  return CANCELLATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyNuboArrivalIntent(value: string): NuboArrivalIntent | null {
  const text = value.normalize("NFKC").trim().toLowerCase().replace(/[\s　]+/g, " ");
  if (!text || isNuboArrivalCancellation(text)) return null;
  if (CHECK_IN_PATTERNS.some((pattern) => pattern.test(text))) return "checkin";
  if (BOOKING_PATTERNS.some((pattern) => pattern.test(text))) return "booking";
  return null;
}
