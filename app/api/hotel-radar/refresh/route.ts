import {
  triggerHotelRadarWorkflow,
} from "@/lib/ainubo-x1";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/*
 * 防止語音誤判連續觸發。
 * 同一個NUBO執行個體10分鐘內只允許一次。
 */
let lastTriggeredAt = 0;

export async function POST(
  request: Request,
) {
  try {
    const requestOrigin =
      request.headers.get(
        "origin",
      );

    const expectedOrigin =
      new URL(
        request.url,
      ).origin;

    if (
      requestOrigin &&
      requestOrigin !==
        expectedOrigin
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "不允許跨網站觸發旅館行情工作流",
        },
        {
          status: 403,
        },
      );
    }

    const now =
      Date.now();

    const cooldownMs =
      10 * 60_000;

    if (
      now -
        lastTriggeredAt <
      cooldownMs
    ) {
      const remainingMinutes =
        Math.ceil(
          (cooldownMs -
            (now -
              lastTriggeredAt)) /
            60_000,
        );

      return Response.json(
        {
          ok: false,
          cooldown: true,
          error:
            `旅館行情工作流剛剛已啟動，請約${remainingMinutes}分鐘後再試。`,
        },
        {
          status: 429,
        },
      );
    }

    const result =
      await triggerHotelRadarWorkflow();

    lastTriggeredAt =
      now;

    return Response.json(
      result,
      {
        status: 202,
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
            : "啟動旅館行情工作流失敗",
      },
      {
        status: 500,
      },
    );
  }
}
