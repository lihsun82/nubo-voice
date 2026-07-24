type OmniRouteMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OmniRouteChatOptions = {
  messages: OmniRouteMessage[];
  model?: string;
  temperature?: number;
  timeoutMs?: number;
};

export type OmniRouteChatResult = {
  text: string;
  model?: string;
  raw: unknown;
};

function getOmniRouteConfig() {
  return {
    enabled: process.env.NUBO_OMNIROUTE_ENABLED === "1",
    baseUrl: (process.env.OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128/v1").replace(/\/$/, ""),
    apiKey: process.env.OMNIROUTE_API_KEY ?? "",
    model: process.env.OMNIROUTE_MODEL ?? "auto",
  };
}

export function isOmniRouteEnabled() {
  return getOmniRouteConfig().enabled;
}

export async function omniRouteChat(options: OmniRouteChatOptions): Promise<OmniRouteChatResult> {
  const config = getOmniRouteConfig();
  if (!config.enabled) {
    throw new Error("OmniRoute pilot is disabled. Set NUBO_OMNIROUTE_ENABLED=1 to enable it.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model ?? config.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        stream: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = (raw as { error?: { message?: string } })?.error?.message;
      throw new Error(detail ?? `OmniRoute request failed: HTTP ${response.status}`);
    }

    const payload = raw as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("OmniRoute returned no assistant text.");
    }

    return { text, model: payload.model, raw };
  } finally {
    clearTimeout(timeout);
  }
}
