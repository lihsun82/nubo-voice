import { generateWithFallback } from "@/lib/ai-engine";
import type { AgentRole } from "@/lib/task-orchestrator";
import type { NuboTask } from "@/lib/task-types";

export type InternalAgentSpec = {
  role: AgentRole;
  title: string;
  mission: string;
  boundaries: string[];
  needsCurrentSources: boolean;
};

export type ParsedAgentStep = {
  id: string;
  role: AgentRole;
  action: string;
  expectedOutput: string;
};

export type AgentExecution = {
  stepId: string;
  role: AgentRole;
  title: string;
  action: string;
  expectedOutput: string;
  output: string;
  provider: string;
  model: string;
};

const AGENT_REGISTRY: Record<AgentRole, InternalAgentSpec> = {
  planner: {
    role: "planner",
    title: "Planner Agent",
    mission: "把使用者目標拆成可驗收的行動規格，先定義邊界、成功條件與停損條件。",
    boundaries: ["不得宣稱已執行外部動作", "不得跳過風險分級", "不得要求未知代理人取得權限"],
    needsCurrentSources: false,
  },
  research: {
    role: "research",
    title: "Research Agent",
    mission: "蒐集、整理與交叉檢查資訊，輸出來源、時間與資訊缺口。",
    boundaries: ["不得捏造來源", "資料不足時必須明確寫資訊不足", "需要最新資訊時要優先使用可連網引擎"],
    needsCurrentSources: true,
  },
  data: {
    role: "data",
    title: "Data Agent",
    mission: "將資訊轉成表格、指標、計算邏輯與可匯出資料結構。",
    boundaries: ["不得隱藏假設", "計算需列公式", "資料缺口必須列出"],
    needsCurrentSources: false,
  },
  report: {
    role: "report",
    title: "Report Agent",
    mission: "把前序結果整理成可直接交付的報告、摘要與檔案內容。",
    boundaries: ["不得只說明流程", "必須產出可讀成果", "需要檔案時要列出檔案清單與用途"],
    needsCurrentSources: false,
  },
  mail: {
    role: "mail",
    title: "Mail Agent",
    mission: "產生可寄送的信件草稿、主旨與交付摘要。",
    boundaries: ["正式寄信需白名單或人工確認", "不得自動寄送未授權對象", "不得包含敏感憑證"],
    needsCurrentSources: false,
  },
  coding: {
    role: "coding",
    title: "Coding Agent",
    mission: "分析程式變更範圍、提出低風險修復與測試方式。",
    boundaries: ["不得修改 LINE 控制穩定版相關檔案", "不得讀取或輸出 Secrets", "高風險修改只能提出計畫"],
    needsCurrentSources: false,
  },
  qa: {
    role: "qa",
    title: "QA Agent",
    mission: "檢查成果是否符合驗收條件，列出缺口、風險與下一步。",
    boundaries: ["不得把未驗證結果寫成已通過", "缺少測試時必須明確說明", "需提出停損條件"],
    needsCurrentSources: false,
  },
  device: {
    role: "device",
    title: "Device Agent",
    mission: "規劃白名單桌機、音量、應用程式與設備控制動作。",
    boundaries: ["不得執行非白名單設備動作", "高風險設備動作需人工確認", "不得修改 LINE 控制穩定版"],
    needsCurrentSources: false,
  },
};

const rolePattern = "planner|research|data|report|mail|coding|qa|device";
const stepRegex = new RegExp(`(S\\d+)\\. \\[(${rolePattern})\\] ([^\\n→]+) → ([^\\n]+)`, "g");

function compact(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[已截斷]` : value;
}

export function listInternalAgents() {
  return Object.values(AGENT_REGISTRY);
}

export function parseAgentSteps(instruction: string): ParsedAgentStep[] {
  const steps: ParsedAgentStep[] = [];
  for (const match of instruction.matchAll(stepRegex)) {
    steps.push({
      id: match[1],
      role: match[2] as AgentRole,
      action: match[3].trim(),
      expectedOutput: match[4].trim(),
    });
  }
  return steps;
}

function buildAgentPrompt(task: NuboTask, step: ParsedAgentStep, previous: AgentExecution[]) {
  const spec = AGENT_REGISTRY[step.role];
  const previousOutputs = previous
    .map(
      (item) =>
        `## ${item.stepId} ${item.title}\n任務：${item.action}\n輸出：\n${compact(item.output, 5000)}`,
    )
    .join("\n\n");

  return [
    `你是 NUBO 內部代理人：${spec.title}`,
    `任務使命：${spec.mission}`,
    "",
    "硬性邊界：",
    ...spec.boundaries.map((item, index) => `${index + 1}. ${item}`),
    "",
    `原始任務標題：${task.title}`,
    `原始任務內容：\n${compact(task.instruction, 12000)}`,
    "",
    `本步驟：${step.id}`,
    `指定角色：${step.role}`,
    `要做的事：${step.action}`,
    `預期輸出：${step.expectedOutput}`,
    "",
    previousOutputs ? `前序代理人輸出：\n${previousOutputs}` : "前序代理人輸出：無",
    "",
    "請用繁體中文直接輸出本步驟成果。若資訊不足，請寫「資訊不足」並列出 3 個關鍵變數。",
  ].join("\n");
}

export async function executeInternalAgentPlan(task: NuboTask): Promise<string | null> {
  const steps = parseAgentSteps(task.instruction);
  if (steps.length === 0) return null;

  const executions: AgentExecution[] = [];
  for (const step of steps.slice(0, 8)) {
    const spec = AGENT_REGISTRY[step.role];
    const result = await generateWithFallback(buildAgentPrompt(task, step, executions), {
      needsCurrentSources: spec.needsCurrentSources,
    });
    executions.push({
      stepId: step.id,
      role: step.role,
      title: spec.title,
      action: step.action,
      expectedOutput: step.expectedOutput,
      output: result.text,
      provider: result.provider,
      model: result.model,
    });
  }

  return [
    `# ${task.title}`,
    "",
    "## NUBO 內部代理人執行結果",
    "",
    ...executions.flatMap((item) => [
      `### ${item.stepId}｜${item.title}`,
      `角色：${item.role}`,
      `執行事項：${item.action}`,
      `預期輸出：${item.expectedOutput}`,
      `AI 引擎：${item.provider}（${item.model}）`,
      "",
      item.output,
      "",
    ]),
    "## 最終狀態",
    "",
    `已完成 ${executions.length}/${steps.length} 個內部代理步驟。`,
  ].join("\n");
}
