import { NextRequest, NextResponse } from "next/server";
import { readAutomationStore } from "@/lib/v12/v12-automations-store";
import { addV12Log, addV12Notification } from "@/lib/v12/v12-store";

export const runtime = "nodejs";

function isSmartHomeAutomation(name: string, steps: string[]) {
  const text = `${name} ${steps.join(" ")}`.toLowerCase();

  return (
    text.includes("smart") ||
    text.includes("home") ||
    text.includes("light") ||
    text.includes("ifttt") ||
    text.includes("device") ||
    text.includes("智慧家庭") ||
    text.includes("投射燈")
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/v12/automations/run",
    message: "Automation Executor is ready",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const id = String(body.id || "");
    const approved = Boolean(body.approved);
    const doubleConfirmed = Boolean(body.doubleConfirmed);
    const action = String(body.action || "on");

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "AUTOMATION_ID_REQUIRED",
          message: "請提供 automation id。",
        },
        { status: 400 }
      );
    }

    const store = readAutomationStore();
    const automation = store.automations.find((item) => item.id === id);

    if (!automation) {
      return NextResponse.json(
        {
          ok: false,
          error: "AUTOMATION_NOT_FOUND",
          message: `找不到指定 automation：${id}`,
        },
        { status: 404 }
      );
    }

    if (automation.status !== "active") {
      addV12Log({
        source: "Automation Executor",
        action: "Automation 未執行",
        status: "warning",
        detail: `${automation.name} 目前狀態為 ${automation.status}，不是 active。`,
      });

      return NextResponse.json({
        ok: false,
        blocked: true,
        reason: "AUTOMATION_NOT_ACTIVE",
        message: "此 automation 尚未啟用，請先切換為 active。",
        automation,
      });
    }

    if (automation.riskLevel === "medium" && !approved) {
      addV12Log({
        source: "Automation Executor",
        action: "需要人工確認",
        status: "pending",
        detail: `${automation.name} 是中風險流程，需要 approved=true。`,
      });

      return NextResponse.json({
        ok: true,
        requiresApproval: true,
        message: "此 automation 為中風險，需要確認後才會執行。",
        automation,
      });
    }

    if (automation.riskLevel === "high" && !doubleConfirmed) {
      addV12Log({
        source: "Automation Executor",
        action: "需要二次確認",
        status: "pending",
        detail: `${automation.name} 是高風險流程，需要 doubleConfirmed=true。`,
      });

      return NextResponse.json({
        ok: true,
        requiresDoubleConfirm: true,
        message: "此 automation 為高風險，需要二次確認後才會執行。",
        automation,
      });
    }

    let result: any = {
      mode: "simulated",
      detail: "此 automation 已模擬執行。",
    };

    if (isSmartHomeAutomation(automation.name, automation.steps)) {
      const origin = new URL(request.url).origin;

      const smartHomeResponse = await fetch(`${origin}/api/smart-home/light`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: action === "off" ? "off" : "on",
        }),
      });

      result = await smartHomeResponse.json().catch(() => ({}));

      if (!smartHomeResponse.ok) {
        addV12Log({
          source: "Automation Executor",
          action: "Smart Home Automation 執行失敗",
          status: "error",
          detail: `${automation.name} 呼叫 /api/smart-home/light 失敗。`,
        });

        return NextResponse.json(
          {
            ok: false,
            error: "SMART_HOME_AUTOMATION_FAILED",
            message: "Smart Home automation 執行失敗。",
            automation,
            result,
          },
          { status: 502 }
        );
      }
    }

    addV12Log({
      source: "Automation Executor",
      action: "Automation 已執行",
      status: "success",
      detail: `${automation.name} 已執行。風險等級：${automation.riskLevel}。`,
    });

    addV12Notification({
      level: "success",
      title: "Automation 已執行",
      message: `${automation.name} 已完成執行流程。`,
    });

    return NextResponse.json({
      ok: true,
      executed: true,
      automation,
      result,
      message: "Automation 已執行。",
    });
  } catch (error: any) {
    addV12Log({
      source: "Automation Executor",
      action: "Automation Executor 錯誤",
      status: "error",
      detail: error?.message || String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        error: "AUTOMATION_RUN_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
