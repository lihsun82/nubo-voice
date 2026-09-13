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

export function getHotelLineStatus() {
  return {
    accessTokenConfigured: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim()),
    targetCount: getHotelLineTargetIds().length,
    targetSource:
      process.env.NUBO_HOTEL_LINE_TARGET_IDS?.trim() || process.env.NUBO_HOTEL_LINE_TARGET_ID?.trim()
        ? "nubo-hotel"
        : process.env.LINE_TARGET_IDS?.trim() || process.env.LINE_TARGET_ID?.trim()
          ? "revenue-radar-compatible"
          : "none",
  };
}

export async function pushHotelLineText(text: string) {
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

  return { targetCount: targets.length, succeeded, failed };
}
