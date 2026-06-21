export async function runGroqEngine(
  prompt: string,
  needsCurrentSources: boolean,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY 尚未設定");
  const model = needsCurrentSources
    ? process.env.GROQ_RESEARCH_MODEL ?? "groq/compound"
    : process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "你是 NUBO 的工作引擎，一律使用繁體中文並直接交付成果。",
        },
        { role: "user", content: prompt },
      ],
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ?? payload?.message ?? `Groq 回應錯誤：${response.status}`;
    throw new Error(message);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Groq 沒有回傳可讀成果");
  }
  return { text: text.trim(), model };
}
