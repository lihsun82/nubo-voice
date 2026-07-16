import {
  fetchLatestHotelRadarSnapshot,
  summarizeHotelRadar,
} from "@/lib/ainubo-x1";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request,
) {
  const url =
    new URL(request.url);

  const zone =
    url.searchParams.get(
      "zone",
    ) || "taichung";

  try {
    const snapshot =
      await fetchLatestHotelRadarSnapshot();

    const report =
      summarizeHotelRadar(
        snapshot,
        zone,
      );

    return Response.json(
      report,
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "讀取旅館行情失敗",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
