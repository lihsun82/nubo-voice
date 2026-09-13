type JsonRecord =
  Record<string, unknown>;

const DEFAULT_OWNER =
  "lihsun82";

const DEFAULT_REPO =
  "AinuboX1";

const DEFAULT_BRANCH =
  "main";

const SNAPSHOT_PATH =
  "google_travel_area_snapshots/latest.json";

const WORKFLOW_FILE =
  "price-radar.yml";

function asRecord(
  value: unknown,
): JsonRecord {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function text(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string"
    ? value
    : fallback;
}

function numberValue(
  value: unknown,
): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function getConfig() {
  const token =
    process.env
      .AINUBO_GITHUB_TOKEN
      ?.trim();

  if (!token) {
    throw new Error(
      "AINUBO_GITHUB_TOKEN尚未設定",
    );
  }

  return {
    token,
    owner:
      process.env
        .AINUBO_GITHUB_OWNER
        ?.trim() ||
      DEFAULT_OWNER,
    repo:
      process.env
        .AINUBO_GITHUB_REPO
        ?.trim() ||
      DEFAULT_REPO,
    branch:
      process.env
        .AINUBO_GITHUB_BRANCH
        ?.trim() ||
      DEFAULT_BRANCH,
  };
}

async function githubFetch(
  apiPath: string,
  init: RequestInit = {},
) {
  const config =
    getConfig();

  const headers =
    new Headers(init.headers);

  headers.set(
    "Accept",
    "application/vnd.github+json",
  );

  headers.set(
    "Authorization",
    `Bearer ${config.token}`,
  );

  headers.set(
    "X-GitHub-Api-Version",
    "2022-11-28",
  );

  headers.set(
    "User-Agent",
    "NUBO-AinuboX1-Agent-Bridge",
  );

  const response =
    await fetch(
      `https://api.github.com${apiPath}`,
      {
        ...init,
        headers,
        cache: "no-store",
      },
    );

  if (!response.ok) {
    const payload =
      await response
        .json()
        .catch(() => ({}));

    const message =
      text(
        asRecord(payload).message,
      ) ||
      `GitHub API錯誤：${response.status}`;

    throw new Error(message);
  }

  return response;
}

function parseCheckedAt(
  value: string,
) {
  if (!value) {
    return null;
  }

  const normalized =
    value.includes("T")
      ? value
      : value.replace(
          " ",
          "T",
        );

  const zoned =
    /(?:Z|[+-]\d{2}:?\d{2})$/i
      .test(normalized)
      ? normalized
      : normalized +
        "+08:00";

  const timestamp =
    Date.parse(zoned);

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : null;
}

function formatMoney(
  value: number | null,
) {
  if (value === null) {
    return "無資料";
  }

  return (
    "NT$" +
    Math.round(value)
      .toLocaleString("zh-TW")
  );
}

function normalizeZone(
  value: string,
) {
  const key =
    value
      .trim()
      .toLowerCase()
      .replace(
        /[\s　_-]+/g,
        "",
      );

  if (
    [
      "",
      "taichung",
      "台中",
      "一中",
      "一中館",
      "新寶",
      "新寶智慧",
      "新寶智慧一中館",
      "錦新街",
    ].includes(key)
  ) {
    return "taichung";
  }

  if (
    [
      "taipei",
      "台北",
      "忠孝復興",
      "忠孝復興站",
      "台北忠孝復興",
    ].includes(key)
  ) {
    return "taipei";
  }

  if (
    [
      "all",
      "全部",
      "所有",
      "兩區",
      "兩個區域",
    ].includes(key)
  ) {
    return "all";
  }

  return key;
}

function zoneMatches(
  zoneId: string,
  zone: string,
) {
  if (zone === "all") {
    return true;
  }

  if (zone === "taichung") {
    return (
      zoneId.includes(
        "taichung",
      ) ||
      zoneId.includes(
        "yizhong",
      )
    );
  }

  if (zone === "taipei") {
    return (
      zoneId.includes(
        "taipei",
      ) ||
      zoneId.includes(
        "zhongxiao",
      )
    );
  }

  return zoneId
    .toLowerCase()
    .includes(zone);
}

export async function
fetchLatestHotelRadarSnapshot() {
  const config =
    getConfig();

  const apiPath =
    "/repos/" +
    encodeURIComponent(
      config.owner,
    ) +
    "/" +
    encodeURIComponent(
      config.repo,
    ) +
    "/contents/" +
    SNAPSHOT_PATH
      .split("/")
      .map(encodeURIComponent)
      .join("/") +
    "?ref=" +
    encodeURIComponent(
      config.branch,
    );

  const response =
    await githubFetch(
      apiPath,
    );

  const payload =
    asRecord(
      await response.json(),
    );

  const encoded =
    text(payload.content)
      .replace(/\s+/g, "");

  if (!encoded) {
    throw new Error(
      "AinuboX1最新行情檔案沒有內容",
    );
  }

  const decoded =
    Buffer.from(
      encoded,
      "base64",
    ).toString("utf8");

  const snapshot =
    JSON.parse(decoded);

  if (
    !snapshot ||
    typeof snapshot !==
      "object"
  ) {
    throw new Error(
      "AinuboX1行情JSON格式不正確",
    );
  }

  return snapshot as JsonRecord;
}

export function
summarizeHotelRadar(
  snapshot: JsonRecord,
  requestedZone = "taichung",
) {
  const zone =
    normalizeZone(
      requestedZone,
    );

  const checkedAt =
    text(
      snapshot.checked_at,
    );

  const checkedAtMs =
    parseCheckedAt(
      checkedAt,
    );

  const ageHours =
    checkedAtMs === null
      ? null
      : Math.max(
          0,
          Math.round(
            ((Date.now() -
              checkedAtMs) /
              3_600_000) *
              10,
          ) / 10,
        );

  /*
   * AinuboX1每日兩次排程。
   * 超過18小時視為過期資料。
   */
  const stale =
    ageHours === null ||
    ageHours > 18;

  const reports =
    asArray(
      snapshot.markets,
    )
      .map(asRecord)
      .filter((market) =>
        zoneMatches(
          text(
            market.zone_id,
          ),
          zone,
        ),
      )
      .map((market) => {
        const stay =
          asRecord(
            market.stay,
          );

        const stats =
          asRecord(
            market.stats,
          );

        const pricing =
          asRecord(
            market.pricing,
          );

        const sellThrough =
          asRecord(
            pricing
              .sell_through,
          );

        const hotels =
          asArray(
            market.hotels,
          )
            .map(asRecord)
            .map((hotel) => ({
              name:
                text(
                  hotel.name,
                  "未知旅館",
                ),
              price:
                numberValue(
                  hotel.price,
                ),
              distanceKm:
                numberValue(
                  hotel.distance_km,
                ),
              rating:
                numberValue(
                  hotel.rating,
                ),
            }))
            .sort(
              (a, b) =>
                (a.price ??
                  Number
                    .MAX_SAFE_INTEGER) -
                (b.price ??
                  Number
                    .MAX_SAFE_INTEGER),
            );

        return {
          zoneId:
            text(
              market.zone_id,
            ),
          zoneName:
            text(
              market.zone_name,
            ),
          stayId:
            text(stay.id),
          stayName:
            text(
              stay.name,
            ),
          checkInDate:
            text(
              stay
                .check_in_date,
            ),
          checkOutDate:
            text(
              stay
                .check_out_date,
            ),
          sampleCount:
            numberValue(
              stats.count,
            ),
          averagePrice:
            numberValue(
              stats.average,
            ),
          medianPrice:
            numberValue(
              stats.median,
            ),
          minimumPrice:
            numberValue(
              stats.min,
            ),
          maximumPrice:
            numberValue(
              stats.max,
            ),
          recommendedPrice:
            numberValue(
              pricing
                .recommended_price,
            ),
          directPrice:
            numberValue(
              pricing
                .direct_price,
            ),
          otaPrice:
            numberValue(
              pricing
                .ota_price,
            ),
          walkinPrice:
            numberValue(
              pricing
                .walkin_price,
            ),
          floorRate:
            numberValue(
              pricing
                .floor_rate,
            ),
          action:
            text(
              pricing
                .action_label,
              text(
                pricing.action,
              ),
            ),
          actionNote:
            text(
              pricing
                .action_note,
            ),
          inventoryAction:
            text(
              pricing
                .inventory_action,
            ),
          confidenceScore:
            numberValue(
              pricing
                .confidence_score,
            ),
          sellThroughPrice:
            numberValue(
              pricing
                .sell_through_price ??
                sellThrough
                  .sell_through_price,
            ),
          sellabilityScore:
            numberValue(
              pricing
                .sellability_score ??
                sellThrough
                  .sellability_score,
            ),
          conversionIncentive:
            text(
              pricing
                .conversion_incentive,
              text(
                sellThrough
                  .incentive,
              ),
            ),
          hotels:
            hotels.slice(0, 8),
        };
      })
      .sort(
        (a, b) =>
          a.checkInDate.localeCompare(
            b.checkInDate,
          ),
      );

  if (
    reports.length === 0
  ) {
    throw new Error(
      `找不到「${requestedZone}」的旅館行情資料`,
    );
  }

  const speechLines = [
    stale
      ? `注意：目前行情資料已過期，最後更新時間是${checkedAt || "未知"}。`
      : `行情資料更新時間：${checkedAt}。`,
  ];

  for (
    const report of reports
  ) {
    speechLines.push(
      [
        report.stayName ||
          report.checkInDate,
        `樣本${report.sampleCount ?? 0}間`,
        `平均${formatMoney(report.averagePrice)}`,
        `中位數${formatMoney(report.medianPrice)}`,
        `最低${formatMoney(report.minimumPrice)}`,
        `建議售價${formatMoney(report.recommendedPrice)}`,
        report.directPrice !==
        null
          ? `官網直訂${formatMoney(report.directPrice)}`
          : "",
        report.otaPrice !==
        null
          ? `OTA${formatMoney(report.otaPrice)}`
          : "",
        report.sellThroughPrice !==
        null
          ? `最可能成交價${formatMoney(report.sellThroughPrice)}`
          : "",
        report.action
          ? `策略${report.action}`
          : "",
      ]
        .filter(Boolean)
        .join("，") +
        "。",
    );

    if (
      report.actionNote
    ) {
      speechLines.push(
        report.actionNote,
      );
    }

    if (
      report
        .conversionIncentive
    ) {
      speechLines.push(
        "成交誘因：" +
          report
            .conversionIncentive,
      );
    }
  }

  return {
    ok: true,
    source:
      "AinuboX1 GitHub Agent",
    checkedAt:
      checkedAt || null,
    ageHours,
    stale,
    requestedZone:
      requestedZone ||
      "taichung",
    resolvedZone: zone,
    reportCount:
      reports.length,
    reports,
    speechText:
      speechLines.join(" "),
  };
}

export async function
triggerHotelRadarWorkflow() {
  const config =
    getConfig();

  const apiPath =
    "/repos/" +
    encodeURIComponent(
      config.owner,
    ) +
    "/" +
    encodeURIComponent(
      config.repo,
    ) +
    "/actions/workflows/" +
    encodeURIComponent(
      WORKFLOW_FILE,
    ) +
    "/dispatches";

  await githubFetch(
    apiPath,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        ref:
          config.branch,
        inputs: {
          mode:
            "production",
        },
      }),
    },
  );

  return {
    ok: true,
    started: true,
    repository:
      config.owner +
      "/" +
      config.repo,
    workflow:
      WORKFLOW_FILE,
    branch:
      config.branch,
    mode:
      "production",
    startedAt:
      new Date()
        .toISOString(),
    message:
      "AinuboX1旅館行情工作流已開始執行。完成前不得宣稱最新行情已更新。",
  };
}
