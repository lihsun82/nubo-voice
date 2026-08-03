import {
  fetchLatestHotelRadarSnapshot,
  summarizeHotelRadar as summarizeBaseHotelRadar,
  triggerHotelRadarWorkflow,
} from "./ainubo-x1-base";

export {
  fetchLatestHotelRadarSnapshot,
  triggerHotelRadarWorkflow,
};

const HOTEL_TIME_ZONE = "Asia/Taipei";
const MAX_RADAR_AGE_HOURS = 18;
const DAY_MS = 86_400_000;

type JsonRecord = Record<string, unknown>;

type BaseRadarReport = JsonRecord & {
  stayName?: unknown;
  checkInDate?: unknown;
  checkOutDate?: unknown;
  sampleCount?: unknown;
  averagePrice?: unknown;
  medianPrice?: unknown;
  minimumPrice?: unknown;
  recommendedPrice?: unknown;
  directPrice?: unknown;
  otaPrice?: unknown;
  sellThroughPrice?: unknown;
  action?: unknown;
  actionNote?: unknown;
  conversionIncentive?: unknown;
};

type BaseRadarSummary = JsonRecord & {
  checkedAt?: unknown;
  ageHours?: unknown;
  reports?: unknown;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatMoney(value: unknown) {
  const numeric = numberValue(value);
  if (numeric === null) return "無資料";
  return `NT$${Math.round(numeric).toLocaleString("zh-TW")}`;
}

function getHotelBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HOTEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyToEpochDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  return Number.isFinite(timestamp)
    ? Math.floor(timestamp / DAY_MS)
    : null;
}

function getStayDateStatus(checkInDate: string, businessDate: string) {
  const checkInDay = dateKeyToEpochDay(checkInDate);
  const businessDay = dateKeyToEpochDay(businessDate);

  if (checkInDay === null || businessDay === null) {
    return {
      dayOffset: null,
      status: "unknown" as const,
      label: checkInDate || "日期未確認",
    };
  }

  const dayOffset = checkInDay - businessDay;

  if (dayOffset < 0) {
    return {
      dayOffset,
      status: "past" as const,
      label: `已過期（${checkInDate}）`,
    };
  }

  if (dayOffset === 0) {
    return { dayOffset, status: "today" as const, label: "今天" };
  }

  if (dayOffset === 1) {
    return { dayOffset, status: "tomorrow" as const, label: "明天" };
  }

  if (dayOffset === 2) {
    return { dayOffset, status: "day-after-tomorrow" as const, label: "後天" };
  }

  return {
    dayOffset,
    status: "future" as const,
    label: checkInDate,
  };
}

function buildReportSpeech(report: BaseRadarReport) {
  const stayName = text(report.stayName, text(report.checkInDate));
  const checkInDate = text(report.checkInDate);
  const checkOutDate = text(report.checkOutDate);
  const stayRange = checkInDate
    ? `${stayName}（${checkInDate}入住${checkOutDate ? `、${checkOutDate}退房` : ""}）`
    : stayName;

  return [
    stayRange,
    `樣本${numberValue(report.sampleCount) ?? 0}間`,
    `平均${formatMoney(report.averagePrice)}`,
    `中位數${formatMoney(report.medianPrice)}`,
    `最低${formatMoney(report.minimumPrice)}`,
    `建議售價${formatMoney(report.recommendedPrice)}`,
    numberValue(report.directPrice) !== null
      ? `官網直訂建議${formatMoney(report.directPrice)}`
      : "",
    numberValue(report.otaPrice) !== null
      ? `OTA建議${formatMoney(report.otaPrice)}`
      : "",
    numberValue(report.sellThroughPrice) !== null
      ? `最可能成交價${formatMoney(report.sellThroughPrice)}`
      : "",
    text(report.action) ? `策略${text(report.action)}` : "",
  ]
    .filter(Boolean)
    .join("，") + "。";
}

export function summarizeHotelRadar(
  snapshot: JsonRecord,
  requestedZone = "taichung",
) {
  const base = summarizeBaseHotelRadar(
    snapshot,
    requestedZone,
  ) as unknown as BaseRadarSummary;

  const operationalDate = getHotelBusinessDate();
  const sourceReports = Array.isArray(base.reports)
    ? (base.reports as BaseRadarReport[])
    : [];

  let dateLabelsCorrected = 0;
  let sourceTodayDateMismatch = false;

  const correctedReports = sourceReports.map((report) => {
    const checkInDate = text(report.checkInDate);
    const sourceStayName = text(report.stayName);
    const dateStatus = getStayDateStatus(checkInDate, operationalDate);

    if (sourceStayName !== dateStatus.label) {
      dateLabelsCorrected += 1;
    }

    if (sourceStayName === "今天" && checkInDate !== operationalDate) {
      sourceTodayDateMismatch = true;
    }

    return {
      ...report,
      sourceStayName,
      stayName: dateStatus.label,
      dayOffset: dateStatus.dayOffset,
      dateStatus: dateStatus.status,
      operationalDate,
    };
  });

  const excludedPastReportCount = correctedReports.filter(
    (report) => report.dateStatus === "past",
  ).length;

  const reports = correctedReports.filter(
    (report) => report.dateStatus !== "past",
  );

  const currentDateCovered = reports.some(
    (report) => text(report.checkInDate) === operationalDate,
  );

  const ageHours = numberValue(base.ageHours);
  const ageStale = ageHours === null || ageHours > MAX_RADAR_AGE_HOURS;
  const noUsableReports = reports.length === 0;
  const staleReasons: string[] = [];

  if (ageHours === null) {
    staleReasons.push("無法確認行情更新時間");
  } else if (ageStale) {
    staleReasons.push(`行情已超過${MAX_RADAR_AGE_HOURS}小時`);
  }

  if (!currentDateCovered) {
    staleReasons.push(`資料未涵蓋台灣飯店營業日${operationalDate}`);
  }

  if (noUsableReports) {
    staleReasons.push("沒有今天或未來入住日的可用行情");
  }

  const stale = ageStale || !currentDateCovered || noUsableReports;
  const quoteEligible = !stale && currentDateCovered;
  const checkedAt = text(base.checkedAt);
  const speechLines: string[] = [];

  if (stale) {
    speechLines.push(
      `注意：目前行情不能直接作為今日報價依據。${staleReasons.join("；")}。最後更新時間是${checkedAt || "未知"}。`,
    );
  } else {
    speechLines.push(
      `行情更新時間：${checkedAt}。已依台灣時間${operationalDate}與實際入住日期重新校正。`,
    );
  }

  if (sourceTodayDateMismatch) {
    speechLines.push(
      "來源檔案的相對日期標籤已跨日，NUBO 已改以實際入住日期判斷，不再沿用錯誤的今天或明天標示。",
    );
  }

  for (const report of reports) {
    speechLines.push(buildReportSpeech(report));

    const actionNote = text(report.actionNote);
    if (actionNote) speechLines.push(actionNote);

    const conversionIncentive = text(report.conversionIncentive);
    if (conversionIncentive) {
      speechLines.push(`成交誘因：${conversionIncentive}`);
    }
  }

  speechLines.push(
    "以上為市場行情與定價建議，不是本館即時可售房價；旅客實際成交價、房型與庫存仍須以訂房系統或現場確認。",
  );

  return {
    ...base,
    timeZone: HOTEL_TIME_ZONE,
    operationalDate,
    ageHours,
    stale,
    staleReasons,
    quoteEligible,
    marketGuidanceOnly: true,
    actualBookableRateConfirmed: false,
    currentDateCovered,
    sourceTodayDateMismatch,
    dateLabelsCorrected,
    excludedPastReportCount,
    reportCount: reports.length,
    reports,
    speechText: speechLines.join(" "),
  };
}
