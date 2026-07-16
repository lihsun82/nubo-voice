import { generateWithFallback } from "@/lib/ai-engine";
import {
  getNuboAgent,
  type NuboAgentDefinition,
  type NuboAgentId,
} from "@/lib/agents/agent-registry";
import { assessCompleteness } from "@/lib/nubo-completeness-guard";
import {
  findApprovedSkills,
  type NuboSkillDefinition,
} from "@/lib/skills/skill-registry";

export type DelegateWorkInput = {
  title?: string;
  instruction: string;
  mode?: "plan" | "execute";
  requireComplete?: boolean;
};

type DelegationPlan = {
  title: string;
  agents: NuboAgentDefinition[];
  skills: NuboSkillDefinition[];
  capabilitySearch: "approved-registry" | "fallback-research";
  requiresConfirmation: boolean;
  steps: string[];
};

const CURRENT_SOURCE_PATTERN =
  /(最新|目前|現在|今天|明天|後天|即時|新聞|行情|價格|天氣|查證|搜尋|比較)/i;
const EXTERNAL_EFFECT_PATTERN =
  /(寄出|正式寄信|刪除|付款|轉帳|改價|取消訂單|下單|發布|傳送)/i;

function uniqueAgentIds(ids: NuboAgentId[]) {
  return [...new Set(ids)];
}

function buildPlan(input: DelegateWorkInput): DelegationPlan {
  const title = input.title?.trim() || "NUBO交辦工作";
  const skills = findApprovedSkills(input.instruction);
  const capabilitySearch = skills.length > 0 ? "approved-registry" : "fallback-research";
  const selectedSkills =
    skills.length > 0
      ? skills
      : [
          {
            id: "fallback-research",
            name: "能力搜尋與研究備援",
            agent: "research" as const,
            description: "找不到直接Skill時，由Research Agent先完成資料與能力探索。",
            keywords: [],
            risk: "read" as const,
            approved: true,
          },
        ];

  const ids: NuboAgentId[] = [
    "brain",
    ...selectedSkills.map((skill) => skill.agent),
    ...(input.requireComplete === false ? [] : (["writer"] as NuboAgentId[])),
    "validator",
  ];
  const agents = uniqueAgentIds(ids)
    .map((id) => getNuboAgent(id))
    .filter((agent): agent is NuboAgentDefinition => Boolean(agent));

  return {
    title,
    agents,
    skills: selectedSkills,
    capabilitySearch,
    requiresConfirmation: EXTERNAL_EFFECT_PATTERN.test(input.instruction),
    steps: [
      "Brain解析需求與完成標準",
      `搜尋已核准Skill：${selectedSkills.map((skill) => skill.name).join("、")}`,
      `分派Agent：${agents.map((agent) => agent.name).join(" → ")}`,
      "執行工作並產出可直接使用的成果",
      "Validator檢查完整性、格式與是否有省略",
      EXTERNAL_EFFECT_PATTERN.test(input.instruction)
        ? "涉及外部影響，等待使用者確認後才執行"
        : "驗收通過後直接交付",
    ],
  };
}

function buildPrompt(input: DelegateWorkInput, plan: DelegationPlan, previous = "") {
  return [
    "你是NUBO Agent Orchestrator，必須直接完成工作，不得只提供做法。",
    `任務名稱：${plan.title}`,
    `使用者交辦：${input.instruction}`,
    `已選Agent：${plan.agents.map((agent) => `${agent.name}（${agent.role}）`).join("、")}`,
    `已選Skill：${plan.skills.map((skill) => skill.name).join("、")}`,
    "交付規則：",
    "1. 直接交付可使用的完整成果。",
    "2. 禁止使用『以下略過』『以下省略』『其餘略』『未完待續』『待補』等省略語句。",
    "3. 使用者要求全文、完整、全部或逐字時，不得用摘要替代。",
    "4. 不得假裝已完成尚未串接的外部操作；需要確認的操作要明確標示。",
    "5. 找不到直接能力時，先用研究與推理完成可交付部分，並精確說明尚缺的權限或串接。",
    previous ? `上次成果未通過完整性驗收，請完整重做：\n${previous}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function delegateWork(input: DelegateWorkInput) {
  const normalized: DelegateWorkInput = {
    ...input,
    mode: input.mode ?? "execute",
    requireComplete: input.requireComplete ?? true,
  };
  const plan = buildPlan(normalized);

  if (normalized.mode === "plan") {
    return {
      ok: true,
      mode: "plan" as const,
      plan,
      result: null,
      validation: null,
    };
  }

  let previous = "";
  let finalResult: Awaited<ReturnType<typeof generateWithFallback>> | null = null;
  let validation = assessCompleteness(plan.title, "");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    finalResult = await generateWithFallback(
      buildPrompt(normalized, plan, previous),
      { needsCurrentSources: CURRENT_SOURCE_PATTERN.test(normalized.instruction) },
    );
    validation = assessCompleteness(plan.title, finalResult.text);
    if (normalized.requireComplete === false || validation.complete) break;
    previous = finalResult.text;
  }

  if (!finalResult || (normalized.requireComplete !== false && !validation.complete)) {
    throw new Error("NUBO已自動改派與重做3次，但成果仍未通過完整性驗收，因此停止交付。 ");
  }

  return {
    ok: true,
    mode: "execute" as const,
    plan,
    result: {
      text: finalResult.text,
      provider: finalResult.provider,
      model: finalResult.model,
      attempts: finalResult.attempts,
    },
    validation: {
      complete: validation.complete,
      characterCount: validation.characterCount,
      omissionLabels: validation.omissionLabels,
    },
  };
}
