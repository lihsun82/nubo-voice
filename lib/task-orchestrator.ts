import {
  formatExternalHandoffSection,
  recommendExternalAgentHandoffs,
  type ExternalAgentHandoff,
} from "@/lib/external-agent-gateway";
import type { CreateTaskInput, TaskKind } from "@/lib/task-types";

export type AgentRole =
  | "planner"
  | "research"
  | "data"
  | "report"
  | "mail"
  | "coding"
  | "qa"
  | "device";

export type RiskLevel = "L1" | "L2" | "L3" | "L4";

export type OrchestratorStep = {
  id: string;
  agent: AgentRole;
  action: string;
  expectedOutput: string;
};

export type OrchestratorPlan = {
  id: string;
  title: string;
  summary: string;
  taskKind: TaskKind;
  agents: AgentRole[];
  externalHandoffs: ExternalAgentHandoff[];
  steps: OrchestratorStep[];
  acceptanceCriteria: string[];
  guardrails: string[];
  blockedActions: string[];
  riskLevel: RiskLevel;
  riskReason: string;
  canAutoCreateTask: boolean;
  confidence: number;
  createdAt: string;
};

export type OrchestratorInput = {
  instruction: string;
  title?: string;
};

const PROTECTED_LINE_SCOPES = [
  "/api/line/webhook",
  "LINE webhook 驗證",
  "LINE 指令解析",
  "桌機控制函式",
  "LINE 控制穩定版",
];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function normalize(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function makeTitle(input: OrchestratorInput) {
  if (input.title?.trim()) return input.title.trim().slice(0, 80);
  return normalize(input.instruction).slice(0, 32) || "NUBO 任務";
}

function inferTaskKind(text: string): TaskKind {
  if (includesAny(text, ["提醒", "叫我", "通知我", "remind"])) return "reminder";
  if (includesAny(text, ["查", "搜尋", "研究", "比價", "市場", "最新", "法規", "news", "research"])) return "research";
  if (includesAny(text, ["報告", "pdf", "html", "excel", "word", "簡報", "整理", "產出", "匯出"])) return "report";
  return "brief";
}

function inferAgents(text: string): AgentRole[] {
  const agents = new Set<AgentRole>(["planner"]);

  if (includesAny(text, ["查", "搜尋", "研究", "比價", "市場", "最新", "法規", "booking", "agoda", "ota"])) {
    agents.add("research");
  }
  if (includesAny(text, ["excel", "csv", "數據", "資料", "營收", "adr", "revpar", "房價", "表格"])) {
    agents.add("data");
  }
  if (includesAny(text, ["pdf", "html", "word", "報告", "簡報", "附件", "排版", "檔案"])) {
    agents.add("report");
  }
  if (includesAny(text, ["email", "gmail", "寄信", "信件", "草稿", "附件"])) {
    agents.add("mail");
  }
  if (includesAny(text, ["github", "程式", "修復", "workflow", "actions", "api", "bug", "錯誤", "部署"])) {
    agents.add("coding");
    agents.add("qa");
  }
  if (includesAny(text, ["開啟", "播放", "音量", "電腦", "桌機", "燈", "google 音箱", "home assistant", "tapo"])) {
    agents.add("device");
  }
  if (agents.size > 1) agents.add("qa");

  return Array.from(agents);
}

function inferRisk(text: string): { riskLevel: RiskLevel; riskReason: string } {
  if (
    includesAny(text, [
      "刪除",
      "永久刪除",
      "付款",
      "轉帳",
      "金流",
      "dns",
      "cloudflare",
      "godaddy",
      "網域",
      "secret",
      "token",
      "api key",
      "合約送出",
      "正式申報",
    ])
  ) {
    return { riskLevel: "L4", riskReason: "涉及不可逆、高權限、金流、網域、Secrets 或正式法律/商務送出動作" };
  }

  if (
    includesAny(text, [
      "github",
      "workflow",
      "actions",
      "部署",
      "deploy",
      "寄信",
      "自動寄送",
      "改程式",
      "修改程式",
      "webhook",
      "line",
    ])
  ) {
    return { riskLevel: "L3", riskReason: "涉及程式、Webhook、正式寄送或外部系統變更，需保留人工確認" };
  }

  if (includesAny(text, ["pdf", "html", "excel", "word", "附件", "草稿", "報告", "排程", "每天", "每小時"])) {
    return { riskLevel: "L2", riskReason: "涉及產檔、草稿、排程或定期交付，但未觸及高權限操作" };
  }

  return { riskLevel: "L1", riskReason: "只涉及查詢、整理、摘要或低風險文字產出" };
}

function buildSteps(input: OrchestratorInput, agents: AgentRole[]): OrchestratorStep[] {
  const text = normalize(input.instruction);
  const steps: OrchestratorStep[] = [
    {
      id: "S1",
      agent: "planner",
      action: "拆解使用者任務、定義成功條件、標註風險與權限邊界",
      expectedOutput: "任務規格、驗收條件、停損條件",
    },
  ];

  if (agents.includes("research")) {
    steps.push({
      id: `S${steps.length + 1}`,
      agent: "research",
      action: "蒐集必要資料並標註來源；無來源時明確標示資訊不足",
      expectedOutput: "可追溯資料、來源摘要、缺口清單",
    });
  }
  if (agents.includes("data")) {
    steps.push({
      id: `S${steps.length + 1}`,
      agent: "data",
      action: "整理資料結構、產生表格或營運指標",
      expectedOutput: "結構化資料、計算欄位、異常值提示",
    });
  }
  if (agents.includes("coding")) {
    steps.push({
      id: `S${steps.length + 1}`,
      agent: "coding",
      action: "只在授權範圍內檢查程式；預設不得修改 LINE 控制穩定版相關檔案",
      expectedOutput: "變更建議、受影響檔案、測試方式",
    });
  }
  if (agents.includes("report")) {
    steps.push({
      id: `S${steps.length + 1}`,
      agent: "report",
      action: "將結果整理成可交付報告格式；需要檔案時先產出內容稿與檔案需求",
      expectedOutput: "報告本文、檔案清單、交付摘要",
    });
  }
  if (agents.includes("mail")) {
    steps.push({
      id: `S${steps.length + 1}`,
      agent: "mail",
      action: "預設建立草稿或收件匣通知；自動寄送只允許白名單收件者",
      expectedOutput: "草稿、寄送狀態或收件匣通知",
    });
  }
  if (agents.includes("device")) {
    steps.push({
      id: `S${steps.length + 1}`,
      agent: "device",
      action: "只執行白名單桌機或設備控制；高風險設備動作需人工確認",
      expectedOutput: "設備操作結果與錯誤回報",
    });
  }

  steps.push({
    id: `S${steps.length + 1}`,
    agent: "qa",
    action: `驗收成果是否符合原始任務：「${text.slice(0, 220)}」`,
    expectedOutput: "通過/未通過、缺漏項目、下一步建議",
  });

  return steps;
}

function buildAcceptanceCriteria(agents: AgentRole[], handoffs: ExternalAgentHandoff[]) {
  const criteria = [
    "成果必須直接回應使用者原始任務，不只描述流程",
    "若使用資料或外部資訊，必須標示來源或明確說明資訊不足",
    "不得捏造已完成的外部操作、寄信、修改程式或產檔結果",
  ];
  if (agents.includes("report")) criteria.push("若任務要求檔案，必須列出檔案格式、內容範圍與產出狀態");
  if (agents.includes("mail")) criteria.push("正式寄信前必須符合白名單或人工確認規則");
  if (agents.includes("coding")) criteria.push("程式變更必須列出受影響檔案與測試方式，不得碰觸保護範圍");
  if (handoffs.length > 0) criteria.push("外部代理人只可使用白名單候選；需要授權者只能產生建議，不得直接執行");
  return criteria;
}

function buildGuardrails(riskLevel: RiskLevel, handoffs: ExternalAgentHandoff[]) {
  const guardrails = [
    "第三階段啟用外部代理人閘道，但只允許白名單與 Adapter 候選，不開放未知外部代理人自動取得權限",
    "最多委派 3 層；連續失敗 2 次即停止並回報",
    "所有高風險動作必須先產生計畫與驗收條件，不得直接執行",
    `LINE 控制穩定版保護：${PROTECTED_LINE_SCOPES.join("、")} 預設禁止修改`,
  ];
  if (handoffs.some((handoff) => handoff.requiresApproval)) {
    guardrails.push("本任務有外部代理人候選需要人工確認；NUBO 只能提出 handoff 建議與授權範圍");
  }
  if (riskLevel === "L3" || riskLevel === "L4") {
    guardrails.push("本任務風險層級需人工確認後才能進入實際修改、寄送、部署或高權限操作");
  }
  return guardrails;
}

function buildBlockedActions(riskLevel: RiskLevel) {
  const blocked = [
    "不得自動尋找或授權未知外部代理人",
    "不得讀取、輸出或提交 Secrets / API Keys / Token",
    "不得修改 LINE 控制穩定版相關檔案，除非使用者明確指定並二次確認",
  ];
  if (riskLevel === "L3" || riskLevel === "L4") {
    blocked.push("不得自動部署、正式寄信、刪資料、改 DNS、改付款或送出法律文件");
  }
  return blocked;
}

export function createOrchestratorPlan(input: OrchestratorInput): OrchestratorPlan {
  const instruction = normalize(input.instruction);
  const title = makeTitle(input);
  const agents = inferAgents(instruction.toLowerCase());
  const { riskLevel, riskReason } = inferRisk(instruction.toLowerCase());
  const taskKind = inferTaskKind(instruction.toLowerCase());
  const externalHandoffs = recommendExternalAgentHandoffs(instruction, agents, riskLevel);
  const canAutoCreateTask = riskLevel === "L1" || riskLevel === "L2";

  return {
    id: crypto.randomUUID(),
    title,
    summary: `NUBO 將任務拆成 ${agents.length} 個內部代理角色、${externalHandoffs.length} 個外部代理候選與 ${agents.length + 1} 個驗收節點；第三階段只允許白名單 handoff，不啟用未知代理人自動授權。`,
    taskKind,
    agents,
    externalHandoffs,
    steps: buildSteps(input, agents),
    acceptanceCriteria: buildAcceptanceCriteria(agents, externalHandoffs),
    guardrails: buildGuardrails(riskLevel, externalHandoffs),
    blockedActions: buildBlockedActions(riskLevel),
    riskLevel,
    riskReason,
    canAutoCreateTask,
    confidence: canAutoCreateTask ? 0.84 : 0.7,
    createdAt: new Date().toISOString(),
  };
}

export function buildTaskInputFromPlan(plan: OrchestratorPlan): CreateTaskInput {
  const instruction = [
    "你是 NUBO 任務指揮中心第三階段執行器。請依照下列計畫交付成果。",
    "",
    `任務：${plan.title}`,
    `風險等級：${plan.riskLevel}（${plan.riskReason}）`,
    "",
    "內部代理人步驟：",
    ...plan.steps.map((step) => `${step.id}. [${step.agent}] ${step.action} → ${step.expectedOutput}`),
    "",
    "外部代理人候選：",
    formatExternalHandoffSection(plan.externalHandoffs),
    "",
    "驗收條件：",
    ...plan.acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`),
    "",
    "保護規則：",
    ...plan.guardrails.map((item, index) => `${index + 1}. ${item}`),
    "",
    "禁止動作：",
    ...plan.blockedActions.map((item, index) => `${index + 1}. ${item}`),
    "",
    "請直接產出可用成果；若需要外部代理人但尚未授權，請只列出代理人建議、授權範圍、3 個關鍵變數與下一步，不得宣稱已執行。",
  ].join("\n");

  return {
    title: plan.title,
    kind: plan.taskKind,
    instruction,
    condition: plan.taskKind === "research" ? "只有找到明確可用資料或條件命中時才回報；否則標示 CONDITION: NO_MATCH。" : undefined,
    delivery: { type: "inbox" },
    schedule: {
      type: "once",
      runAt: new Date(Date.now() + 5_000).toISOString(),
      timezone: "Asia/Taipei",
    },
  };
}
