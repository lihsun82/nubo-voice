import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

let automations = [
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
    route: "/api/v12/automations",
    automations
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");

  automations = automations.map((item) =>
    item.id === id ? { ...item, status } : item
  );

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

  return NextResponse.json({
    ok: true,
    automation
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const automation = {
    id: `auto_${Date.now()}`,
    name: String(body.name || "未命名 Automation"),
    description: String(body.description || "尚未填寫描述"),
    status: "draft",
    riskLevel: String(body.riskLevel || "low"),
    steps: String(body.steps || "Trigger,Brain,Action,Log")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    createdAt: new Date().toLocaleString("zh-TW", { hour12: false })
  };

  automations = [automation, ...automations];

  return NextResponse.json({
    ok: true,
    automation
  });
}
