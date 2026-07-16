import { NextResponse } from "next/server";
import { z } from "zod";
import { createNuboArtifact } from "@/lib/nubo-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const schema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("word"),
    title: z.string().min(1).max(120),
    content: z.string().min(1).max(100_000),
  }),
  z.object({
    format: z.literal("excel"),
    title: z.string().min(1).max(120),
    columns: z.array(z.string().min(1).max(100)).min(1).max(100),
    rows: z.array(z.array(cellSchema).max(100)).min(1).max(10_000),
  }),
]);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "文件資料格式不完整",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const artifact = await createNuboArtifact(parsed.data);
    return NextResponse.json({
      ok: true,
      artifact,
      downloadUrl: `/api/artifacts/${artifact.id}`,
      instruction:
        "文件已生成。請向使用者說明檔名、格式與下載連結；不得宣稱已寄信，除非後續Gmail寄送流程確實完成。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "文件生成失敗",
      },
      { status: 500 },
    );
  }
}
