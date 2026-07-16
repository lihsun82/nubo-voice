import { NextResponse } from "next/server";
import { z } from "zod";
import { delegateWork } from "@/lib/agents/nubo-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(1).max(120).optional(),
  instruction: z.string().min(2).max(8000),
  mode: z.enum(["plan", "execute"]).optional(),
  requireComplete: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "交辦工作資料不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await delegateWork(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "NUBO交辦工作失敗" },
      { status: 500 },
    );
  }
}
