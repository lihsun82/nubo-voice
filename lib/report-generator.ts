import { generateWithFallback } from "@/lib/ai-engine";
import type { NuboTask } from "@/lib/task-types";

export async function generateResult(task: NuboTask): Promise<string> {
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

  const result = await generateWithFallback(prompt, { needsCurrentSources });
  const failed = result.attempts.filter((item) => item.error);
  const fallbackNote = failed.length
    ? `；已略過：${failed.map((item) => item.provider).join("、")}`
    : "";

  return `${result.text}\n\n---\nAI 引擎：${result.provider}（${result.model}）${fallbackNote}`;
}
