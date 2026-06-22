import { generateWithFallback } from "@/lib/ai-engine";
import {
  createGmailDraft,
  isEmailAutosendAllowed,
  readGmailMessage,
  searchGmail,
  sendGmailMessage,
} from "@/lib/gmail";
import { addInboxItem } from "@/lib/inbox-store";
import { generateResult } from "@/lib/report-generator";
import type { NuboTask } from "@/lib/task-types";

async function generateFromGmail(task: NuboTask): Promise<string> {
  if (task.source?.type !== "gmail") return generateResult(task);
  const summaries = await searchGmail(
    task.source.query,
    task.source.maxResults ?? 10,
  );
  const records = [];
  for (const summary of summaries.slice(0, 10)) {
    if (task.source.includeBody) {
      const full = await readGmailMessage(summary.id);
      records.push({
        ...summary,
        body: full.body.slice(0, 6000),
      });
    } else {
      records.push(summary);
    }
  }

  const prompt = [
    "你是 NUBO 的郵件工作流助理。請以繁體中文完成工作。",
    `任務名稱：${task.title}`,
    `工作內容：${task.instruction}`,
    task.condition ? `回報條件：${task.condition}` : "",
    `Gmail搜尋條件：${task.source.query}`,
    `找到郵件數：${records.length}`,
    "郵件資料：",
    JSON.stringify(records, null, 2).slice(0, 45000),
    "請勿捏造信件內容；如果沒有郵件，明確說明沒有符合條件的郵件。",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateWithFallback(prompt, { needsCurrentSources: false });
  return `${result.text}\n\n---\n資料來源：Gmail（${task.source.query}）\nAI引擎：${result.provider}（${result.model}）`;
}

export async function generateTaskOutput(task: NuboTask): Promise<string> {
  if (task.kind === "reminder") return task.instruction;
  if (task.source?.type === "gmail") return generateFromGmail(task);
  return generateResult(task);
}

export async function deliverTaskOutput(task: NuboTask, output: string) {
  const delivery = task.delivery ?? { type: "inbox" as const };
  let note = "已送至NUBO收件匣";

  if (delivery.type === "gmail_draft") {
    await createGmailDraft(
      delivery.to,
      delivery.subject ?? task.title,
      output,
    );
    note = `已建立Gmail草稿：${delivery.to}`;
  } else if (delivery.type === "gmail_send") {
    if (isEmailAutosendAllowed(delivery.to)) {
      await sendGmailMessage(
        delivery.to,
        delivery.subject ?? task.title,
        output,
      );
      note = `已自動寄送至白名單收件者：${delivery.to}`;
    } else {
      await createGmailDraft(
        delivery.to,
        delivery.subject ?? task.title,
        output,
      );
      note = `未符合自動寄送白名單，已改建Gmail草稿：${delivery.to}`;
    }
  }

  const notice = await addInboxItem(
    task.id,
    task.title,
    `${output}\n\n---\n交付結果：${note}`,
  );
  return { note, notice };
}
