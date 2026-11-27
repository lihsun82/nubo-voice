"use client";

const CLOCK_URL = "/api/clock?timezone=Asia%2FTaipei";

export function formatNuboSessionClockInstruction(value: unknown) {
  const data = value as Record<string, unknown> | null;
  if (data?.source === "server-clock" && data.timezone === "Asia/Taipei" &&
      typeof data.localDate === "string" && typeof data.localIso === "string" &&
      typeof data.weekday === "string") {
    return [
      "【NUBO 台灣時間快照】",
      `今天：${data.localDate} ${data.weekday}；當地時間：${data.localIso}。`,
      "這是連線時的快照。回答當前時間或換算相對日期時，請重新呼叫 get_current_time。",
    ].join("\n");
  }
  return "【NUBO 時間來源提醒】目前沒有台灣時間快照。回答當前時間或換算相對日期時，請先呼叫 get_current_time。查不到時請旅客確認，勿自行猜測。";
}

/**
 * Load a server-clock snapshot for voice providers that do not return one
 * with their token. Relative-date questions still use the live clock tool.
 */
export async function loadNuboSessionClockInstruction() {
  try {
    const response = await fetch(CLOCK_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    return formatNuboSessionClockInstruction(response.ok ? await response.json() : null);
  } catch {
    return formatNuboSessionClockInstruction(null);
  }
}
