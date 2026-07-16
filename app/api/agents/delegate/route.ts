import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { delegateWork } from "@/lib/agents/nubo-orchestrator";
import {
  getAgentWorkRun,
  listAgentWorkRuns,
  saveAgentWorkRun,
  type AgentWorkRun,
} from "@/lib/agents/agent-run-store";
import { addInboxItem } from "@/lib/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(1).max(120).optional(),
  instruction: z.string().min(2).max(8000),
  mode: z.enum(["plan", "execute"]).optional(),
  requireComplete: z.boolean().optional(),
});

function extractResultText(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const payload = result as {
    result?: { text?: unknown } | null;
  };
  return typeof payload.result?.text === "string"
    ? payload.result.text
    : "";
}

function extractPlanSummary(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const payload = result as {
    plan?: {
      agents?: Array<{ name?: unknown }>;
      skills?: Array<{ name?: unknown }>;
    };
  };
  const agentNames = Array.isArray(payload.plan?.agents)
    ? payload.plan.agents
        .map((agent) =>
          typeof agent?.name === "string"
            ? agent.name
            : "",
        )
        .filter(Boolean)
    : [];
  const skillNames = Array.isArray(payload.plan?.skills)
    ? payload.plan.skills
        .map((skill) =>
          typeof skill?.name === "string"
            ? skill.name
            : "",
        )
        .filter(Boolean)
    : [];

  return [
    agentNames.length > 0
      ? `Agent：${agentNames.join(" → ")}`
      : "",
    skillNames.length > 0
      ? `Skill：${skillNames.join("、")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function compactRun(run: AgentWorkRun) {
  const text = extractResultText(run.result);
  return {
    id: run.id,
    title: run.title,
    instruction: run.instruction,
    mode: run.mode,
    status: run.status,
    requireComplete: run.requireComplete,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    resultPreview: text
      ? text.slice(0, 600)
      : "",
    resultCharacterCount: text.length,
    error: run.error,
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  if (id) {
    const run = await getAgentWorkRun(id);
    if (!run) {
      return NextResponse.json(
        { error: "找不到指定的Agent交辦紀錄" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      run,
      speechText:
        run.status === "success" ||
        run.status === "planned"
          ? `交辦工作「${run.title}」已完成，成果已保存到NUBO收件匣。`
          : run.status === "failed"
            ? `交辦工作「${run.title}」執行失敗：${run.error ?? "未知錯誤"}`
            : `交辦工作「${run.title}」正在執行。`,
    });
  }

  const requestedLimit = Number(
    url.searchParams.get("limit") ?? 5,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(
        Math.max(Math.floor(requestedLimit), 1),
        30,
      )
    : 5;
  const runs = await listAgentWorkRuns(limit);

  return NextResponse.json({
    ok: true,
    count: runs.length,
    runs: runs.map(compactRun),
    speechText:
      runs.length > 0
        ? `最近有${runs.length}筆交辦工作。最新一筆「${runs[0].title}」狀態是${runs[0].status}。`
        : "目前沒有Agent交辦紀錄。",
  });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(
    await request.json(),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "交辦工作資料不完整",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const input = {
    ...parsed.data,
    mode: parsed.data.mode ?? "execute",
    requireComplete:
      parsed.data.requireComplete ?? true,
  };
  const run: AgentWorkRun = {
    id: crypto.randomUUID(),
    title:
      input.title?.trim() || "NUBO交辦工作",
    instruction: input.instruction,
    mode: input.mode,
    requireComplete: input.requireComplete,
    status: "running",
    createdAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
  };

  await saveAgentWorkRun(run);

  try {
    const result = await delegateWork(input);
    run.status =
      input.mode === "plan"
        ? "planned"
        : "success";
    run.finishedAt = new Date().toISOString();
    run.result = result;
    await saveAgentWorkRun(run);

    const resultText = extractResultText(result);
    const planSummary = extractPlanSummary(result);
    const noticeMessage = [
      `交辦狀態：${run.status}`,
      `交辦內容：${run.instruction}`,
      planSummary,
      resultText
        ? `\n完整成果：\n${resultText.slice(0, 16000)}`
        : "本次為規劃模式，完整計畫已保存於交辦紀錄。",
    ]
      .filter(Boolean)
      .join("\n");
    const notice = await addInboxItem(
      run.id,
      `Agent交辦完成｜${run.title}`,
      noticeMessage,
    );

    return NextResponse.json({
      ...result,
      runId: run.id,
      runStatus: run.status,
      saved: true,
      inboxNoticeId: notice.id,
      deliveredToInbox: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "NUBO交辦工作失敗";
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.error = message;
    await saveAgentWorkRun(run);

    const notice = await addInboxItem(
      run.id,
      `Agent交辦失敗｜${run.title}`,
      [
        `交辦內容：${run.instruction}`,
        `失敗原因：${message}`,
        "NUBO沒有宣稱工作已完成，請依錯誤原因重新交辦或補充必要權限。",
      ].join("\n"),
    );

    return NextResponse.json(
      {
        error: message,
        runId: run.id,
        runStatus: run.status,
        saved: true,
        inboxNoticeId: notice.id,
        deliveredToInbox: true,
      },
      { status: 500 },
    );
  }
}
