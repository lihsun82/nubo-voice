import { NextResponse } from "next/server";
import { listInternalAgents } from "@/lib/internal-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, agents: listInternalAgents() });
}
