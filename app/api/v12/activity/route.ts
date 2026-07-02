import { NextResponse } from "next/server";
import { nuboActivities } from "@/lib/v12/nubo-v12-data";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "V12",
    activities: nuboActivities
  });
}
