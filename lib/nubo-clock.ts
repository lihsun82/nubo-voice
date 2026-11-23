/** Authoritative Gregorian calendar date/time for a requested IANA timezone. */
export const NUBO_DEFAULT_TIMEZONE = "Asia/Taipei";

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;
const TWO = (value: number) => String(value).padStart(2, "0");

function checkedTimezone(requested: unknown) {
  const supplied = typeof requested === "string" && requested.trim() ? requested.trim() : NUBO_DEFAULT_TIMEZONE;
  try {
    if (supplied.length > 80 || !/^[A-Za-z0-9_+./-]+$/.test(supplied)) throw Error("invalid timezone");
    new Intl.DateTimeFormat("en-US", { timeZone: supplied });
    return { requestedTimezone: supplied, timezone: supplied, fallbackApplied: false };
  } catch {
    return { requestedTimezone: supplied.slice(0, 80), timezone: NUBO_DEFAULT_TIMEZONE, fallbackApplied: true };
  }
}

export function getNuboClockSnapshot(requestedTimezone: unknown = NUBO_DEFAULT_TIMEZONE, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid clock instant");
  const zone = checkedTimezone(requestedTimezone);
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: zone.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const number = (part: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((item) => item.type === part)?.value;
    const n = Number(value);
    if (!value || !Number.isInteger(n)) throw new Error("Cannot resolve timezone clock");
    return n;
  };
  const [year, month, day, hour, minute, second] = [
    number("year"), number("month"), number("day"),
    number("hour"), number("minute"), number("second"),
  ];
  const dateOf = (delta: number) => {
    const calendarDate = new Date(Date.UTC(year, month - 1, day + delta));
    return {
      date: `${calendarDate.getUTCFullYear()}-${TWO(calendarDate.getUTCMonth() + 1)}-${TWO(calendarDate.getUTCDate())}`,
      weekday: WEEKDAYS[calendarDate.getUTCDay()],
      weekdayIndex: calendarDate.getUTCDay(),
    };
  };
  const today = dateOf(0);
  const offsetMinutes = Math.round(
    (Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(now.getTime() / 1000) * 1000) / 60000,
  );
  const offsetSign = offsetMinutes < 0 ? "-" : "+";
  const offset = `${offsetSign}${TWO(Math.floor(Math.abs(offsetMinutes) / 60))}:${TWO(Math.abs(offsetMinutes) % 60)}`;
  const localIso = `${today.date}T${TWO(hour)}:${TWO(minute)}:${TWO(second)}${offset}`;
  return {
    ok: true,
    source: "server-clock",
    calendar: "gregory",
    ...zone,
    isoUtc: now.toISOString(),
    unixMs: now.getTime(),
    localDate: today.date,
    localIso,
    localTime: `${today.date} ${today.weekday} ${TWO(hour)}:${TWO(minute)}:${TWO(second)}`,
    weekday: today.weekday,
    weekdayIndex: today.weekdayIndex,
    year: String(year), month: TWO(month), day: TWO(day),
    hour: TWO(hour), minute: TWO(minute), second: TWO(second),
    utcOffsetMinutes: offsetMinutes,
    today,
    tomorrow: dateOf(1),
    dayAfterTomorrow: dateOf(2),
  };
}