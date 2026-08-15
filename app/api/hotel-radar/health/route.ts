import { fetchLatestHotelRadarSnapshot, summarizeHotelRadar } from "@/lib/ainubo-x1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classify(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/TOKEN|權限|授權|401|403/i.test(message)) return "AUTH_ERROR";
  if (/設定|尚未設定|環境變數/i.test(message)) return "CONFIG_ERROR";
  if (/404|找不到|沒有內容|JSON/i.test(message)) return "SOURCE_ERROR";
  return "OFFLINE";
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const snapshot = await fetchLatestHotelRadarSnapshot();
    const report = summarizeHotelRadar(snapshot, "all");
    return Response.json({
      ok: true,
      connected: true,
      status: report.stale ? "STALE" : "ONLINE",
      checkedAt: report.checkedAt ?? null,
      ageHours: report.ageHours ?? null,
      stale: report.stale === true,
      reportCount: report.reportCount ?? 0,
      source: "AinuboX1 Hotel Radar",
      elapsedMs: Date.now() - startedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      ok: false,
      connected: false,
      status: classify(error),
      error: error instanceof Error ? error.message : "旅宿監控連線失敗",
      source: "AinuboX1 Hotel Radar",
      elapsedMs: Date.now() - startedAt,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
