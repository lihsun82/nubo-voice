import { NextResponse } from "next/server";
import { readArtifactContent } from "@/lib/artifact-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await readArtifactContent(id);
  if (!item) return NextResponse.json({ error: "找不到檔案" }, { status: 404 });

  return new NextResponse(item.content, {
    headers: {
      "Content-Type": item.artifact.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(item.artifact.filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
