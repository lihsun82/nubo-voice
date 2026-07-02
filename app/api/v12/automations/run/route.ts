import { NextRequest, NextResponse } from "next/server";

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

const automations = [
  {
    id: "auto_light_control",
    name: "智慧家庭控制",
    description: "透過 NUBO 控制投射燈。",
    status: "active",
    riskLevel: "low",
    steps: ["Trigger", "Smart Home API", "IFTTT", "Device", "Log"],
    createdAt: "system"
  }
];

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/v12/automations/run",
    message: "Automation Executor is ready"
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const id = String(body.id || "");
    const action = String(body.action || "on");
    const approved = Boolean(body.approved);
    const doubleConfirmed = Boolean(body.doubleConfirmed);

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "AUTOMATION_ID_REQUIRED",
          message: "請提供 automation id。"
        },
        { status: 400 }
      );
    }

    const automation = automations.find((item) => item.id === id);

    if (!automation) {
      return NextResponse.json(
        {
          ok: false,
          error: "AUTOMATION_NOT_FOUND",
          message: `找不到 automation：${id}`
        },
        { status: 404 }
      );
    }

    if (automation.status !== "active") {
      return NextResponse.json({
        ok: false,
        blocked: true,
        reason: "AUTOMATION_NOT_ACTIVE",
        message: "此 automation 尚未啟用。"
      });
    }

    if (automation.riskLevel === "medium" && !approved) {
      return NextResponse.json({
        ok: true,
        requiresApproval: true,
        message: "此 automation 為中風險，需要確認後才會執行。",
        automation
      });
    }

    if (automation.riskLevel === "high" && !doubleConfirmed) {
      return NextResponse.json({
        ok: true,
        requiresDoubleConfirm: true,
        message: "此 automation 為高風險，需要二次確認後才會執行。",
        automation
      });
    }

    let result: any = {
      mode: "simulated",
      detail: "此 automation 已模擬執行。"
    };

    if (isSmartHomeAutomation(automation.name, automation.steps)) {
      const origin = new URL(request.url).origin;

      const smartHomeResponse = await fetch(`${origin}/api/smart-home/light`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: action === "off" ? "off" : "on"
        })
      });

      result = await smartHomeResponse.json().catch(() => ({}));

      if (!smartHomeResponse.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "SMART_HOME_AUTOMATION_FAILED",
            message: "Smart Home automation 執行失敗。",
            automation,
            result
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      executed: true,
      automation,
      result,
      message: action === "off" ? "Automation 已執行：關燈。" : "Automation 已執行：開燈。"
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "AUTOMATION_RUN_FAILED",
        message: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}
