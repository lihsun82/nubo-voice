import { NextRequest, NextResponse } from "next/server";
import {
  createAutomation,
  deleteAutomation,
  readAutomationStore,
  updateAutomationStatus,
} from "@/lib/v12/v12-automations-store";
import { addV12Log, addV12Notification } from "@/lib/v12/v12-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const store = readAutomationStore();

    return NextResponse.json({
      ok: true,
      route: "/api/v12/automations",
      automations: store.automations || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "AUTOMATIONS_GET_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (!body.name) {
      return NextResponse.json(
        {
          ok: false,
          error: "AUTOMATION_NAME_REQUIRED",
          message: "請提供 automation name。",
        },
        { status: 400 }
      );
    }

    const steps = String(body.steps || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const automation = createAutomation({
      name: String(body.name),
      description: String(body.description || ""),
      riskLevel: body.riskLevel || "low",
      steps,
    });

    addV12Log({
      source: "Automation Builder",
      action: "新增 Automation",
      status: "success",
      detail: `已新增流程：${automation.name}`,
    });

    addV12Notification({
      level: "success",
      title: "Automation 已建立",
      message: `已新增流程：${automation.name}`,
    });

    return NextResponse.json({
      ok: true,
      automation,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "AUTOMATIONS_POST_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const status = String(body.status || "");

    if (!id || !["active", "paused", "draft"].includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "INVALID_AUTOMATION_UPDATE",
          message: "請提供 id 與 status: active / paused / draft。",
        },
        { status: 400 }
      );
    }

    const automation = updateAutomationStatus(id, status as any);

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

    addV12Log({
      source: "Automation Builder",
      action: "更新 Automation 狀態",
      status: "success",
      detail: `${automation.name} → ${automation.status}`,
    });

    return NextResponse.json({
      ok: true,
      automation,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "AUTOMATIONS_PATCH_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");

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

    const result = deleteAutomation(id);

    addV12Log({
      source: "Automation Builder",
      action: "刪除 Automation",
      status: result.deleted ? "success" : "warning",
      detail: result.deleted ? `已刪除：${id}` : `找不到：${id}`,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "AUTOMATIONS_DELETE_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
