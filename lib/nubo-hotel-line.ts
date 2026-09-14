import {
  pushLineText,
  pushLineTextWithToken,
} from "@/lib/line-messaging";
import {
  getLineBridgeCredentials,
  isLineCredentialBridgeConfigured,
} from "@/lib/nubo-line-credential-bridge";

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
  const bridgeConfigured = isLineCredentialBridgeConfigured();
  const relay = getRelayConfig();
  const relayConfigured = Boolean(relay.url && relay.secret);
  const directTargetCount = getHotelLineTargetIds().length;
  return {
    accessTokenConfigured,
    bridgeConfigured,
    relayConfigured,
    deliveryReady: accessTokenConfigured || bridgeConfigured || relayConfigured,
    deliveryMode: accessTokenConfigured
      ? "direct"
      : bridgeConfigured
        ? "private-bridge-direct"
        : relayConfigured
          ? "relay"
          : "none",
    targetCount: directTargetCount || (bridgeConfigured ? 1 : 0),
    targetSource:
      process.env.NUBO_HOTEL_LINE_TARGET_IDS?.trim() || process.env.NUBO_HOTEL_LINE_TARGET_ID?.trim()
        ? "nubo-hotel"
        : process.env.LINE_TARGET_IDS?.trim() || process.env.LINE_TARGET_ID?.trim()
          ? "revenue-radar-compatible"
          : bridgeConfigured
            ? "private-credential-bridge"
            : "none",
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRelayError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return (
    name.includes("timeout") ||
    name.includes("abort") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("network")
  );
}

async function sendRelayAttempt(text: string, timeoutMs: number) {
  const relay = getRelayConfig();
  const response = await fetch(relay.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${relay.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function pushViaRelay(text: string) {
  const relay = getRelayConfig();
  if (!relay.url || !relay.secret) {
    throw new Error("LINE客務 Relay 尚未設定");
  }

  const attempts = [22_000, 60_000];
  let lastError: Error | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const { response, payload } = await sendRelayAttempt(text, attempts[index]);
      if (response.ok && payload?.ok === true) {
        return {
          targetCount: 1,
          succeeded: 1,
          failed: 0,
          via: "relay" as const,
          attempts: index + 1,
        };
      }

      const detail = payload?.error ? ` ${String(payload.error)}` : "";
      const error = new Error(`LINE客務 Relay 發送失敗：${response.status}${detail}`);
      const retryableEdgeStatus = [429, 502, 503, 504].includes(response.status) && !detail;
      if (index === 0 && retryableEdgeStatus) {
        lastError = error;
        await delay(1_500);
        continue;
      }
      throw error;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (index === 0 && isRetryableRelayError(normalized)) {
        lastError = normalized;
        await delay(1_500);
        continue;
      }
      throw normalized;
    }
  }

  throw lastError ?? new Error("LINE客務 Relay 發送失敗");
}

async function summarizePushResults(
  targetCount: number,
  results: PromiseSettledResult<string>[],
  via: "direct" | "private-bridge-direct",
) {
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
  return { targetCount, succeeded, failed, via };
}

export async function pushHotelLineText(text: string) {
  const accessTokenConfigured = Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim());

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
    return summarizePushResults(targets.length, results, "direct");
  }

  // Preferred production path when LINE credentials live in the dedicated
  // webhook service. Credentials are mirrored over Render's private network to
  // a private Key Value store, so each guest alert can go straight from NUBO to
  // LINE without traversing the Free relay's public edge (which can return 429).
  const bridged = await getLineBridgeCredentials();
  if (bridged?.accessToken && bridged.targetIds.length) {
    try {
      const results = await Promise.allSettled(
        bridged.targetIds.map(async (target) => {
          await pushLineTextWithToken(bridged.accessToken, target, text);
          return target;
        }),
      );
      const result = await summarizePushResults(
        bridged.targetIds.length,
        results,
        "private-bridge-direct",
      );
      console.info("[LINE hotel] direct bridge delivery succeeded", {
        targetCount: result.targetCount,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      return result;
    } catch (error) {
      console.warn("[LINE hotel] direct bridge delivery failed; falling back to relay", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return pushViaRelay(text);
}
