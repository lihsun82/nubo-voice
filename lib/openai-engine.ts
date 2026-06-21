function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const text = (entry as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

export async function runOpenAIEngine(
  prompt: string,
  needsCurrentSources: boolean,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 尚未設定");
  const model = process.env.OPENAI_WORK_MODEL ?? process.env.NUBO_WORK_MODEL ?? "gpt-5.4-mini";
  const body: Record<string, unknown> = {
    model,
    input: prompt,
    reasoning: { effort: "low" },
  };
  if (needsCurrentSources) {
    body.tools = [{ type: "web_search", search_context_size: "low" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier":
        process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } }).error?.message ??
      `OpenAI 回應錯誤：${response.status}`;
    throw new Error(message);
  }
  const text = extractText(payload);
  if (!text) throw new Error("OpenAI 沒有回傳可讀成果");
  return { text, model };
}
