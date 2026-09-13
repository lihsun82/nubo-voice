import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";
import {
  generateWithFallback,
} from "@/lib/ai-engine";
import {
  getTravelPrefetchRecord,
} from "@/lib/travel-prefetch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  origin: z.string().trim().min(1).max(100),
  destination:
    z.string().trim().min(1).max(100),
  departureDate:
    z.string().trim().min(1).max(50),
  returnDate:
    z.string().trim().min(1).max(50),
  travelers:
    z.number().int().min(1).max(20),
  budget:
    z.string().trim().min(1).max(100),
  preferences:
    z.string().trim().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
) {
  const parsed = schema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "旅遊資料不完整，需要出發地、目的地、日期、人數與預算。",
      },
      { status: 400 },
    );
  }

  try {
    const prefetch =
      getTravelPrefetchRecord();

    const prompt = [
      "你是 NUBO 的高 CP 值旅遊規劃師。",
      "請使用繁體中文。",
      "涉及航班、價格與營業資訊時，使用最新可取得資料並標明資料日期。",
      "先給可執行摘要，再給航班策略、住宿區域、每日動線、交通、預算與注意事項。",
      "價格無法確認時，必須標明為估算，不可假裝即時票價。",
      "",
      `出發地：${parsed.data.origin}`,
      `目的地：${parsed.data.destination}`,
      `出發日期：${parsed.data.departureDate}`,
      `回程日期：${parsed.data.returnDate}`,
      `旅客人數：${parsed.data.travelers}`,
      `總預算：${parsed.data.budget}`,
      `偏好：${parsed.data.preferences ?? "未指定"}`,
      "",
      prefetch?.status === "ready"
        ? `背景預抓資料：\n${prefetch.result}`
        : "背景預抓資料尚未完成，請直接完成規劃。",
    ].join("\n");

    const result =
      await generateWithFallback(
        prompt,
        { needsCurrentSources: true },
      );

    return NextResponse.json({
      ok: true,
      result: result.text,
      provider: result.provider,
      model: result.model,
      usedPrefetch:
        prefetch?.status === "ready",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "旅遊規劃失敗",
      },
      { status: 500 },
    );
  }
}
