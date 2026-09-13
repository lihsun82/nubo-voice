import { NextResponse } from "next/server";
import { readNuboArtifact } from "@/lib/nubo-artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { record, buffer } = await readNuboArtifact(id);
    const encodedFilename = encodeURIComponent(record.filename);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition":
          `attachment; filename*=UTF-8''${encodedFilename}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "找不到文件",
      },
      { status: 404 },
    );
  }
}
