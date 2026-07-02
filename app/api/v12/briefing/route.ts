import { NextResponse } from "next/server";
import { readV12Store } from "@/lib/v12/v12-store";

export const runtime = "nodejs";

export async function GET() {
  const store = readV12Store();
  const logs = store.logs || [];
  const notifications = store.notifications || [];

  const warningCount = logs.filter((x: any) => x.status === "warning").length;
  const errorCount = logs.filter((x: any) => x.status === "error").length;
  const smartHomeCount = logs.filter((x: any) => String(x.source).toLowerCase().includes("smart")).length;

  return NextResponse.json({
    ok: true,
    title: "NUBO 今日簡報",
    summary: "V12 Automation Command Center 已啟動。請優先完成智慧家庭自動關閉衝突排查，並開始累積活動紀錄。",
    metrics: {
      logs: logs.length,
      notifications: notifications.length,
      warnings: warningCount,
      errors: errorCount,
      smartHomeEvents: smartHomeCount
    },
    priorities: [
      "確認 Tapo App 是否有 Auto-Off / Timer / Smart Action",
      "確認 IFTTT 只保留 tapo_p100_on/off Webhook Applet",
      "把 Smart Home 結果改為可驗證狀態",
      "建立每日簡報與每週回顧流程"
    ]
  });
}
