import { NextResponse } from "next/server";
import { z } from "zod";
import { searchGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z.number().int().min(1).max(20).default(10),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Gmail搜尋條件不完整" }, { status: 400 });
  }
  try {
    const messages = await searchGmail(parsed.data.query, parsed.data.maxResults);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gmail搜尋失敗" },
      { status: 500 },
    );
  }
}
