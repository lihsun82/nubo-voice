/**
 * Group enquiries must never be sent as a single-room PMS request.
 * The public live PMS endpoint accepts 1..20 adults, but that is a
 * transport validation bound, NOT the hotel's per-room capacity.
 * The largest advertised room type is for four people; children,
 * bed configurations and group allocation require staff confirmation.
 */
export const NUBO_ADVERTISED_MAX_ROOM_GUESTS = 4;

export type NuboGroupBookingArgs = {
  adults?: unknown;
  children?: unknown;
  childAges?: unknown;
  coachCount?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  nights?: unknown;
  roomPreferences?: unknown;
  contact?: unknown;
};

function parseCount(value: unknown): number | null {
  const n = typeof value === "number" ? value
    : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= 500 ? n : null;
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}
function validDate(value: unknown): string | null {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(date + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date ? date : null;
}

/**
 * A group enquiry is an acknowledgement / intake workflow only.
 * No inventory, quote, booking, bus parking or staff delivery is implied.
 */
export function buildNuboGroupBookingGuidance(args: NuboGroupBookingArgs = {}) {
  const adults = parseCount(args.adults);
  const children = parseCount(args.children) ?? 0;
  const coachCount = parseCount(args.coachCount) ?? 0;
  const checkIn = validDate(args.checkIn);
  const checkOut = validDate(args.checkOut);
  const nights = parseCount(args.nights);
  const childAges = Array.isArray(args.childAges)
    ? args.childAges.filter((age): age is number => Number.isInteger(age) && age >= 0 && age <= 17)
    : [];
  const roomPreferences = text(args.roomPreferences);
  const contact = text(args.contact);
  const missing: string[] = [];
  if (!checkIn) missing.push("入住日期");
  if (!checkOut && !(nights && nights > 0)) missing.push("退房日期或住宿晚數");
  if (children > 0 && childAges.length !== children) missing.push("每位小孩的年齡");
  if (!roomPreferences) missing.push("預計的雙人房、雙床房與四人房配置");
  if (!contact) missing.push("聯絡方式（正式詢價前）");
  const firstQuestion = !checkIn || (!checkOut && !(nights && nights > 0))
    ? "請問預計哪天入住、住幾晚？"
    : children > 0 && childAges.length !== children
      ? "請問小朋友各幾歲，以及希望如何分房？"
      : !roomPreferences
        ? "請問希望以雙人房、雙床房還是四人房為主？"
        : !contact
          ? "方便留下聯絡方式，讓館方確認團體房況與報價嗎？"
          : "館方須核對整團的可用房間與團體報價；可聯絡 04-22231157 進一步確認。";
  const countPhrase = adults !== null
    ? `${adults}位大人${children ? `、${children}位小孩` : ""}`
    : `${children}位小孩及其他團員`;
  return {
    ok: true,
    type: "group_booking_inquiry",
    flow: "manual_group_quote",
    propertyId: "ainubo-taichung-jinxin",
    adults,
    children,
    coachCount,
    checkIn,
    checkOut,
    nights: nights && nights > 0 ? nights : null,
    childAges,
    roomPreferences: roomPreferences || null,
    missing,
    inventoryConfirmed: false,
    priceConfirmed: false,
    bookingConfirmed: false,
    roomCountConfirmed: false,
    notifiedStaff: false,
    parking: {
      confirmedPartnership: "台安醫院旁特約停車場",
      onSiteHotelParking: false,
      coachParkingConfirmed: false,
      notes: "僅確認飯店有配合附近停車場；遊覽車能否進出、停放、車高及費用須向停車場或現場查證，不得承諾可停。",
    },
    nextQuestion: firstQuestion,
    speechText: `收到，${countPhrase}屬於團體住宿，需要核對多間房及小孩入住規範，不能直接當作單間房查詢，也還不能確認有房。飯店有配合台安醫院旁停車場，但遊覽車能否停放要另外確認。${firstQuestion}`,
  } as const;
}

export function isGroupOccupancy(adults: unknown, children: unknown = 0): boolean {
  const a = parseCount(adults);
  const c = parseCount(children);
  return a !== null && a + (c ?? 0) > NUBO_ADVERTISED_MAX_ROOM_GUESTS;
}
