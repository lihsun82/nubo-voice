import type { NextRequest } from "next/server";
import { GET as getVoiceSession } from "@/app/api/gemini-token/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return getVoiceSession(request);
}
