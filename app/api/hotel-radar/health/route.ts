import { fetchLatestHotelRadarSnapshot, summarizeHotelRadar } from "@/lib/ainubo-x1";
import { fetchAinuboX1LiveStatus } from "@/lib/ainubo-x1-live-status";

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
    const [snapshot, live] = await Promise.all([
      fetchLatestHotelRadarSnapshot(),
      fetchAinuboX1LiveStatus(),
    ]);
    const report = summarizeHotelRadar(snapshot, "all");

    const workflowFailed = live.workflowConclusion === "failure";
    const stale = report.stale === true;
    const status = workflowFailed ? "WORKFLOW_FAILED" : stale ? "STALE" : "ONLINE";

    return Response.json({
      ok: !workflowFailed && !stale,
      connected: true,
      status,
      checkedAt: report.checkedAt ?? null,
      ageHours: report.ageHours ?? null,
      stale,
      reportCount: report.reportCount ?? 0,
      source: "AinuboX1 Hotel Radar",
      repository: live.repository,
      branch: live.branch,
      workflow: live.workflow,
      workflowStatus: live.workflowStatus,
      workflowConclusion: live.workflowConclusion,
      workflowRunId: live.workflowRunId,
      workflowStartedAt: live.workflowStartedAt,
      workflowUpdatedAt: live.workflowUpdatedAt,
      latestRunAgeMinutes: live.latestRunAgeMinutes,
      lastFailureSlot: live.lastFailureSlot,
      lastFailureRecordedAt: live.lastFailureRecordedAt,
      lastFailure: live.lastFailure,
      message: workflowFailed
        ? `新寶旅宿監控已真實連線，但最新正式工作流失敗；行情資料最後更新於${report.checkedAt ?? "未知時間"}。`
        : stale
          ? `新寶旅宿監控已真實連線，但行情資料已過期；最後更新於${report.checkedAt ?? "未知時間"}。`
          : `新寶旅宿監控已真實連線，行情資料更新於${report.checkedAt ?? "未知時間"}。`,
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
