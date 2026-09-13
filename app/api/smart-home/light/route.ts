import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LightAction = "on" | "off";
type Provider = "custom-url" | "home-assistant" | "tapo-cloud" | "ifttt";

type TapoCloudDevice = {
  deviceId?: string;
  deviceMac?: string;
  deviceType?: string;
  alias?: string;
  deviceName?: string;
  appServerUrl?: string;
  appServerUrlV2?: string;
};

type TapoEnvelope = {
  error_code?: number;
  msg?: string;
  result?: {
    token?: string;
    deviceList?: TapoCloudDevice[];
    responseData?: string;
  };
};

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function detectAction(body: Record<string, unknown>): LightAction | null {
  const raw = String(
    body.action ??
      body.state ??
      body.intent ??
      body.text ??
      body.command ??
      "",
  ).toLowerCase();

  if (
    raw.includes("off") ||
    raw.includes("turn_off") ||
    raw.includes("關") ||
    raw.includes("關燈") ||
    raw.includes("關掉") ||
    raw.includes("關閉")
  ) {
    return "off";
  }

  if (
    raw.includes("on") ||
    raw.includes("turn_on") ||
    raw.includes("開") ||
    raw.includes("開燈") ||
    raw.includes("打開")
  ) {
    return "on";
  }

  return null;
}

function getBridgeConfig() {
  const customOnUrl = env("NUBO_LIGHT_ON_URL");
  const customOffUrl = env("NUBO_LIGHT_OFF_URL");

  const homeAssistantUrl = env("NUBO_HOME_ASSISTANT_URL");
  const homeAssistantEntityId = env("NUBO_HOME_ASSISTANT_ENTITY_ID");
  const homeAssistantToken =
    env("NUBO_HOME_ASSISTANT_TOKEN") || env("HOME_ASSISTANT_TOKEN");

  const tapoEmail = env("NUBO_TAPO_EMAIL") || env("TAPO_EMAIL");
  const tapoPassword = env("NUBO_TAPO_PASSWORD") || env("TAPO_PASSWORD");
  const tapoDeviceId = env("NUBO_TAPO_DEVICE_ID");
  const tapoDeviceMac = env("NUBO_TAPO_DEVICE_MAC").replace(/[:-]/g, "").toUpperCase();
  const tapoDeviceName = env("NUBO_TAPO_DEVICE_NAME");
  const tapoCloudEndpoint = env("NUBO_TAPO_CLOUD_ENDPOINT");

  const iftttKey =
    env("IFTTT_KEY") || env("NUBO_IFTTT_KEY") || env("IFTTT_WEBHOOK_KEY");
  const eventOn =
    env("TAPO_EVENT_ON") || env("NUBO_LIGHT_EVENT_ON") || "tapo_p100_on";
  const eventOff =
    env("TAPO_EVENT_OFF") || env("NUBO_LIGHT_EVENT_OFF") || "tapo_p100_off";

  const providers = {
    customUrl: Boolean(customOnUrl && customOffUrl),
    homeAssistant: Boolean(homeAssistantUrl && homeAssistantEntityId),
    tapoCloud: Boolean(tapoEmail && tapoPassword),
    ifttt: Boolean(iftttKey),
  };

  return {
    customOnUrl,
    customOffUrl,
    homeAssistantUrl,
    homeAssistantEntityId,
    homeAssistantToken,
    tapoEmail,
    tapoPassword,
    tapoDeviceId,
    tapoDeviceMac,
    tapoDeviceName,
    tapoCloudEndpoint,
    iftttKey,
    eventOn,
    eventOff,
    providers,
  };
}

function configuredProvider(config: ReturnType<typeof getBridgeConfig>): Provider | null {
  if (config.providers.customUrl) return "custom-url";
  if (config.providers.homeAssistant) return "home-assistant";
  if (config.providers.tapoCloud) return "tapo-cloud";
  if (config.providers.ifttt) return "ifttt";
  return null;
}

function providerLabel(provider: Provider | null) {
  if (provider === "custom-url") return "智慧燈 URL 橋接";
  if (provider === "home-assistant") return "Home Assistant";
  if (provider === "tapo-cloud") return "Tapo Cloud";
  if (provider === "ifttt") return "IFTTT Webhooks";
  return "尚未設定";
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 12_000,
) {
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function controlCustomUrl(
  action: LightAction,
  body: Record<string, unknown>,
  config: ReturnType<typeof getBridgeConfig>,
) {
  const url = action === "on" ? config.customOnUrl : config.customOffUrl;
  if (!url) throw new Error("控制 URL 尚未完整設定");

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      room: String(body.room ?? "").trim() || undefined,
      device: String(body.device ?? "").trim() || undefined,
      source: "nubo",
    }),
  });

  if (!response.ok) {
    throw new Error(`控制 URL 回應 HTTP ${response.status}`);
  }
}

async function controlHomeAssistant(
  action: LightAction,
  config: ReturnType<typeof getBridgeConfig>,
) {
  const baseUrl = config.homeAssistantUrl.replace(/\/+$/, "");
  const entityId = config.homeAssistantEntityId;
  if (!baseUrl || !entityId) throw new Error("Home Assistant 尚未完整設定");

  const domain = entityId.includes(".") ? entityId.split(".")[0] : "homeassistant";
  const service = action === "on" ? "turn_on" : "turn_off";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.homeAssistantToken) {
    headers.Authorization = `Bearer ${config.homeAssistantToken}`;
  }

  const response = await fetchWithTimeout(`${baseUrl}/api/services/${domain}/${service}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!response.ok) {
    throw new Error(`Home Assistant 回應 HTTP ${response.status}`);
  }
}

async function tapoPost(url: string, body: unknown, token = "") {
  const target = new URL(url);
  if (token) target.searchParams.set("token", token);

  const response = await fetchWithTimeout(target.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Tapo Cloud 回應 HTTP ${response.status}`);
  }

  return (await response.json()) as TapoEnvelope;
}

async function tapoLogin(
  endpoint: string,
  email: string,
  password: string,
) {
  const payload = await tapoPost(endpoint, {
    method: "login",
    params: {
      appType: "Tapo_Android",
      cloudUserName: email,
      cloudPassword: password,
      terminalUUID: crypto.randomUUID(),
    },
  });

  const token = payload.result?.token ?? "";
  if (payload.error_code !== 0 || !token) {
    throw new Error(`Tapo 登入失敗 (${payload.error_code ?? "unknown"})`);
  }
  return token;
}

async function tapoDeviceList(endpoint: string, token: string) {
  const payload = await tapoPost(endpoint, { method: "getDeviceList" }, token);
  if (payload.error_code !== 0) {
    throw new Error(`Tapo 裝置清單失敗 (${payload.error_code ?? "unknown"})`);
  }
  return payload.result?.deviceList ?? [];
}

function normalizeMac(value: string | undefined) {
  return (value ?? "").replace(/[:-]/g, "").toUpperCase();
}

function chooseTapoDevice(
  devices: TapoCloudDevice[],
  requestedDevice: string,
  config: ReturnType<typeof getBridgeConfig>,
) {
  const plugs = devices.filter((device) => device.deviceType === "SMART.TAPOPLUG");

  if (config.tapoDeviceId) {
    const exact = plugs.find((device) => device.deviceId === config.tapoDeviceId);
    if (exact) return exact;
  }

  if (config.tapoDeviceMac) {
    const exact = plugs.find(
      (device) => normalizeMac(device.deviceMac) === config.tapoDeviceMac,
    );
    if (exact) return exact;
  }

  const wantedNames = [requestedDevice, config.tapoDeviceName]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const wanted of wantedNames) {
    const exact = plugs.find((device) =>
      [device.alias, device.deviceName]
        .map((value) => (value ?? "").trim().toLowerCase())
        .some((value) => value === wanted),
    );
    if (exact) return exact;

    const partial = plugs.find((device) =>
      [device.alias, device.deviceName]
        .map((value) => (value ?? "").trim().toLowerCase())
        .some((value) => value.includes(wanted)),
    );
    if (partial) return partial;
  }

  const projectionLight = plugs.find((device) =>
    [device.alias, device.deviceName].some((value) =>
      (value ?? "").includes("投射燈"),
    ),
  );
  if (projectionLight) return projectionLight;

  if (plugs.length === 1) return plugs[0];
  if (plugs.length === 0) throw new Error("Tapo 帳號找不到智慧插座");
  throw new Error("Tapo 有多個智慧插座，請設定 NUBO_TAPO_DEVICE_NAME 或 DEVICE_ID");
}

function tapoInnerSucceeded(payload: TapoEnvelope) {
  if (payload.error_code !== undefined && payload.error_code !== 0) return false;
  const raw = payload.result?.responseData;
  if (!raw) return true;

  try {
    const parsed = JSON.parse(raw) as unknown;
    const scan = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return true;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if ((key === "error_code" || key === "err_code") && Number(child) !== 0) {
          return false;
        }
        if (!scan(child)) return false;
      }
      return true;
    };
    return scan(parsed);
  } catch {
    return true;
  }
}

async function tapoPassthrough(
  server: string,
  token: string,
  deviceId: string,
  requestData: unknown,
) {
  const payload = await tapoPost(
    server,
    {
      method: "passthrough",
      params: {
        deviceId,
        requestData: JSON.stringify(requestData),
      },
    },
    token,
  );
  return tapoInnerSucceeded(payload);
}

async function controlTapoCloud(
  action: LightAction,
  body: Record<string, unknown>,
  config: ReturnType<typeof getBridgeConfig>,
) {
  if (!config.tapoEmail || !config.tapoPassword) {
    throw new Error("Tapo Cloud 帳號尚未設定");
  }

  const endpoints = Array.from(
    new Set(
      [
        config.tapoCloudEndpoint,
        "https://aps1-wap.tplinkcloud.com/",
        "https://eu-wap.tplinkcloud.com/",
      ].filter(Boolean),
    ),
  );

  let lastError = "Tapo Cloud 無法連線";
  for (const endpoint of endpoints) {
    try {
      const token = await tapoLogin(endpoint, config.tapoEmail, config.tapoPassword);
      const devices = await tapoDeviceList(endpoint, token);
      const requestedDevice = String(body.device ?? "").trim();
      const target = chooseTapoDevice(devices, requestedDevice, config);
      const deviceId = target.deviceId ?? "";
      if (!deviceId) throw new Error("Tapo 裝置缺少 deviceId");
      const server = target.appServerUrlV2 || target.appServerUrl || endpoint;
      const state = action === "on";

      const payloads: unknown[] = [
        { method: "set_device_info", params: { device_on: state } },
        {
          method: "multipleRequest",
          params: {
            requests: [{ method: "set_device_info", params: { device_on: state } }],
          },
        },
        { system: { set_relay_state: { state: state ? 1 : 0 } } },
      ];

      for (const payload of payloads) {
        try {
          if (await tapoPassthrough(server, token, deviceId, payload)) return;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Tapo 指令失敗";
        }
      }
      lastError = "Tapo 裝置拒絕所有相容控制指令";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Tapo Cloud 控制失敗";
    }
  }

  throw new Error(lastError);
}

async function controlIfttt(
  action: LightAction,
  body: Record<string, unknown>,
  config: ReturnType<typeof getBridgeConfig>,
) {
  if (!config.iftttKey) throw new Error("IFTTT Webhook 尚未設定");
  const eventName = action === "on" ? config.eventOn : config.eventOff;
  const room = String(body.room ?? "").trim();
  const device = String(body.device ?? "").trim();
  const url = `https://maker.ifttt.com/trigger/${encodeURIComponent(
    eventName,
  )}/with/key/${encodeURIComponent(config.iftttKey)}`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value1: room || "NUBO",
      value2: action,
      value3: device || "tapo_p100",
    }),
  });

  if (!response.ok) {
    throw new Error(`IFTTT 回應 HTTP ${response.status}`);
  }
}

async function runProvider(
  provider: Provider,
  action: LightAction,
  body: Record<string, unknown>,
  config: ReturnType<typeof getBridgeConfig>,
) {
  if (provider === "custom-url") return controlCustomUrl(action, body, config);
  if (provider === "home-assistant") return controlHomeAssistant(action, config);
  if (provider === "tapo-cloud") return controlTapoCloud(action, body, config);
  return controlIfttt(action, body, config);
}

function providerSequence(config: ReturnType<typeof getBridgeConfig>): Provider[] {
  const providers: Provider[] = [];
  if (config.providers.customUrl) providers.push("custom-url");
  if (config.providers.homeAssistant) providers.push("home-assistant");
  if (config.providers.tapoCloud) providers.push("tapo-cloud");
  if (config.providers.ifttt) providers.push("ifttt");
  return providers;
}

export async function GET() {
  const config = getBridgeConfig();
  const provider = configuredProvider(config);
  const available = Boolean(provider);

  return NextResponse.json({
    ok: true,
    available,
    enabled: available,
    mode: "webhook",
    provider: provider ?? "none",
    providers: config.providers,
    message: available
      ? `智慧燈控制已就緒：${providerLabel(provider)}。`
      : "智慧燈尚未設定控制來源。可使用 Tapo Cloud、Home Assistant、自訂控制 URL 或 IFTTT。",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = detectAction(body);

    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          error: "UNKNOWN_LIGHT_ACTION",
          message: "請提供 action: on/off，或文字包含開燈/關燈。",
        },
        { status: 400 },
      );
    }

    const config = getBridgeConfig();
    const providers = providerSequence(config);
    if (providers.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "SMART_HOME_BRIDGE_NOT_CONFIGURED",
          providers: config.providers,
          message:
            "智慧燈尚未設定控制來源。可設定 Tapo Cloud、Home Assistant、自訂控制 URL 或 IFTTT。",
        },
        { status: 503 },
      );
    }

    const failures: Array<{ provider: Provider; error: string }> = [];
    for (const provider of providers) {
      try {
        await runProvider(provider, action, body, config);
        return NextResponse.json({
          ok: true,
          available: true,
          enabled: true,
          mode: "webhook",
          provider,
          action,
          room: String(body.room ?? "").trim() || null,
          device: String(body.device ?? "").trim() || null,
          controlled: 1,
          matched: 1,
          message:
            action === "on"
              ? `已透過 ${providerLabel(provider)} 送出開燈指令。`
              : `已透過 ${providerLabel(provider)} 送出關燈指令。`,
          fallbackAttempts: failures.map((item) => item.provider),
        });
      } catch (error) {
        failures.push({
          provider,
          error: error instanceof Error ? error.message.slice(0, 180) : "控制失敗",
        });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "SMART_HOME_ALL_PROVIDERS_FAILED",
        message: "已嘗試所有已設定的智慧燈控制方式，但目前都未成功。",
        failures,
      },
      { status: 502 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "SMART_HOME_LIGHT_ERROR",
        message: error instanceof Error ? error.message : "智慧燈控制失敗",
      },
      { status: 500 },
    );
  }
}
