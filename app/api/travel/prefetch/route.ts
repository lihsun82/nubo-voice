import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";
import {
  getTravelPrefetchRecord,
  startTravelPrefetch,
} from "@/lib/travel-prefetch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().trim().min(3).max(1000),
});

export async function POST(
  request: NextRequest,
) {
  const parsed = schema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "旅遊預抓需求不完整" },
      { status: 400 },
    );
  }

  const record = startTravelPrefetch(
    parsed.data.query,
  );

  return NextResponse.json(
    {
      ok: true,
      status: record.status,
      startedAt: record.startedAt,
    },
    { status: 202 },
  );
}

export async function GET() {
  const record =
    getTravelPrefetchRecord();

  return NextResponse.json({
    ok: true,
    record,
  });
}
