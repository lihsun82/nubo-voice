import type { NuboTask } from "@/lib/task-types";

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

export async function generateResult(task: NuboTask): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 尚未設定");

  const needsCurrentSources = task.kind === "research" || task.kind === "brief";
  const prompt = [
    "你是 NUBO 的工作助理。請以繁體中文完成以下任務。",
    `現在時間：${new Date().toISOString()}，使用者時區為 Asia/Taipei。`,
    `任務名稱：${task.title}`,
    `工作內容：${task.instruction}`,
    task.condition ? `回報條件：${task.condition}` : "",
    task.kind === "research"
      ? "第一行請寫 CONDITION: MATCH 或 CONDITION: NO_MATCH，接著說明判斷依據與來源。"
      : "請直接交付成果，不要只描述做法。",
  ]
    .filter(Boolean)
    .join("\n");

  const requestBody: Record<string, unknown> = {
    model: process.env.NUBO_WORK_MODEL ?? "gpt-5.4-mini",
    input: prompt,
    reasoning: { effort: "low" },
  };
  if (needsCurrentSources) {
    requestBody.tools = [{ type: "web_search", search_context_size: "low" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier":
        process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } }).error?.message ??
      `OpenAI 回應錯誤：${response.status}`;
    throw new Error(message);
  }

  const text = extractText(payload);
  if (!text) throw new Error("OpenAI 沒有回傳可讀成果");
  return text;
}
