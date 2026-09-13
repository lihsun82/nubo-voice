import { generateWithFallback } from "@/lib/ai-engine";

export type TravelPrefetchRecord = {
  query: string;
  status: "running" | "ready" | "error";
  result?: string;
  provider?: string;
  model?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
};

type TravelPrefetchGlobal =
  typeof globalThis & {
    __nuboTravelPrefetch?: TravelPrefetchRecord;
    __nuboTravelPrefetchPromise?: Promise<void> | null;
  };

const travelGlobal =
  globalThis as TravelPrefetchGlobal;

const CACHE_MS = 20 * 60_000;

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

export function getTravelPrefetchRecord() {
  const record =
    travelGlobal.__nuboTravelPrefetch;

  if (!record) {
    return null;
  }

  if (
    Date.now() - record.startedAt >
    CACHE_MS
  ) {
    return null;
  }

  return record;
}

export function startTravelPrefetch(
  rawQuery: string,
) {
  const query = normalizeQuery(rawQuery);
  const current = getTravelPrefetchRecord();

  if (
    current &&
    current.query === query &&
    (
      current.status === "running" ||
      current.status === "ready"
    )
  ) {
    return current;
  }

  const record: TravelPrefetchRecord = {
    query,
    status: "running",
    startedAt: Date.now(),
  };

  travelGlobal.__nuboTravelPrefetch =
    record;

  const prompt = [
    "你是 NUBO 的旅遊背景預抓代理人。",
    "使用繁體中文，快速整理可供後續規劃使用的資料。",
    "使用者可能尚未提供完整日期或預算，因此先整理：",
    "1. 從台灣前往日本的常見高 CP 值航點與月份。",
    "2. 廉航與傳統航空的行李、機場及轉乘差異。",
    "3. 日本主要城市住宿與交通的省錢策略。",
    "4. 規劃正式行程前仍需向使用者確認的條件。",
    "內容控制精簡，避免長篇敘述。",
    `使用者原始需求：${query}`,
  ].join("\n");

  const promise =
    generateWithFallback(
      prompt,
      { needsCurrentSources: true },
    )
      .then((result) => {
        const latest =
          travelGlobal
            .__nuboTravelPrefetch;

        if (
          !latest ||
          latest.query !== query
        ) {
          return;
        }

        travelGlobal.__nuboTravelPrefetch = {
          ...latest,
          status: "ready",
          result: result.text,
          provider: result.provider,
          model: result.model,
          completedAt: Date.now(),
        };
      })
      .catch((error) => {
        const latest =
          travelGlobal
            .__nuboTravelPrefetch;

        if (
          !latest ||
          latest.query !== query
        ) {
          return;
        }

        travelGlobal.__nuboTravelPrefetch = {
          ...latest,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "旅遊預抓失敗",
          completedAt: Date.now(),
        };
      })
      .finally(() => {
        travelGlobal
          .__nuboTravelPrefetchPromise =
            null;
      });

  travelGlobal
    .__nuboTravelPrefetchPromise =
      promise;

  return record;
}
