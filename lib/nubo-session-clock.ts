"use client";

const CLOCK_URL = "/api/clock?timezone=Asia%2FTaipei";

/**
 * Seed both Live speech sessions with the exact Taiwan date, not the device
 * clock or model training date. Refresh at every new voice connection.
 * Relative-date questions must still call get_current_time at query time,
 * especially if the session spans midnight.
 */
export async function loadNuboSessionClockInstruction() {
  try {
    const response = await fetch(CLOCK_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error("clock_unavailable");
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") throw new Error("clock_bad_payload");
    const data = value as Record<string, unknown>;
    if (data.source !== "server-clock" ||
        data.timezone !== "Asia/Taipei" ||
        typeof data.localDate !== "string" ||
        typeof data.localIso !== "string" ||
        typeof data.weekday !== "string") throw new Error("clock_bad_payload");
    return [
      "【NUBO 伺服器提供的台灣日期時間快照（連線建立時）】",
      `今天：${data.localDate} ${data.weekday}；當地時間：${data.localIso}。`,
      "這是連線建立時的快照，不是永久不變的今天。",
      "凡是使用者問今天幾號、星期幾、現在幾點、明天、後天、訂房入住日期、跨午夜或未來相對日期，",
      "必須在當次詢問時重新呼叫 get_current_time；工具回傳的 localDate/today/tomorrow 才是最終依據。",
      "不要把 isoUtc 的 UTC 日期當成台灣今天，也不准依模型的訓練日期、舊行情快照或手機日期猜測。",
    ].join("\n");
  } catch {
    return [
      "【NUBO 時間來源提醒】",
      "本次連線建立時無法取得伺服器時間。",
      "回答任何今日、明日、星期、相對日期或入住退房日期前都必須呼叫 get_current_time。",
      "若時間工具仍失敗，不可猜測日期或錯報房價，請旅客稍後再試或向現場人員確認。",
    ].join("\n");
  }
}
