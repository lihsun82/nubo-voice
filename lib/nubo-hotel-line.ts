import { pushLineText } from "@/lib/line-messaging";

function splitTargets(raw: string) {
  return raw
    .replace(/;/g, ",")
    .replace(/\n/g, ",")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getHotelLineTargetIds(): string[] {
  const raw =
    process.env.NUBO_HOTEL_LINE_TARGET_IDS?.trim() ||
    process.env.NUBO_HOTEL_LINE_TARGET_ID?.trim() ||
    process.env.LINE_TARGET_IDS?.trim() ||
    process.env.LINE_TARGET_ID?.trim() ||
    "";

  return Array.from(new Set(splitTargets(raw)));
}

function getRelayConfig() {
  return {
    url: process.env.NUBO_HOTEL_LINE_RELAY_URL?.trim() || "",
    secret: process.env.NUBO_HOTEL_LINE_RELAY_SECRET?.trim() || "",
  };
}

export function getHotelLineStatus() {
  const accessTokenConfigured = Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim());
  const relay = getRelayConfig();
  const relayConfigured = Boolean(relay.url && relay.secret);
  return {
    accessTokenConfigured,
    relayConfigured,
    deliveryReady: accessTokenConfigured || relayConfigured,
    deliveryMode: accessTokenConfigured ? "direct" : relayConfigured ? "relay" : "none",
    targetCount: getHotelLineTargetIds().length,
    targetSource:
      process.env.NUBO_HOTEL_LINE_TARGET_IDS?.trim() || process.env.NUBO_HOTEL_LINE_TARGET_ID?.trim()
        ? "nubo-hotel"
        : process.env.LINE_TARGET_IDS?.trim() || process.env.LINE_TARGET_ID?.trim()
          ? "revenue-radar-compatible"
          : "none",
  };
}

async function pushViaRelay(text: string) {
  const relay = getRelayConfig();
  if (!relay.url || !relay.secret) {
    throw new Error("LINE客務 Relay 尚未設定");
  }

  const response = await fetch(relay.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${relay.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(
      `LINE客務 Relay 發送失敗：${response.status}${payload?.error ? ` ${String(payload.error)}` : ""}`,
    );
  }

  return {
    targetCount: 1,
    succeeded: 1,
    failed: 0,
    via: "relay" as const,
  };
}

export async function pushHotelLineText(text: string) {
  const accessTokenConfigured = Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim());

  // Preferred path when this service owns a LINE Messaging API token.
  if (accessTokenConfigured) {
    const targets = getHotelLineTargetIds();
    if (!targets.length) {
      throw new Error(
        "LINE客務群組尚未設定：請設定 NUBO_HOTEL_LINE_TARGET_ID(S) 或沿用房價雷達 LINE_TARGET_ID(S)",
      );
    }

    const results = await Promise.allSettled(
      targets.map(async (target) => {
        await pushLineText(target, text);
        return target;
      }),
    );

    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (!succeeded) {
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      throw firstFailure?.reason instanceof Error
        ? firstFailure.reason
        : new Error("LINE客務群組推送失敗");
    }

    return { targetCount: targets.length, succeeded, failed, via: "direct" as const };
  }

  // NUBO production intentionally does not duplicate the Revenue Radar bot token.
  // When the token is absent, send through the authenticated relay that already
  // owns the same LINE bot credentials used by the room-price crawler.
  return pushViaRelay(text);
}
