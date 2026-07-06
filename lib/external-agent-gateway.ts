import type { AgentRole, RiskLevel } from "@/lib/task-orchestrator";

export type ExternalAgentKind = "mcp" | "a2a" | "api" | "internal_adapter";
export type ExternalAgentStatus = "available" | "needs_config" | "planned" | "disabled";

export type ExternalAgentSpec = {
  id: string;
  name: string;
  kind: ExternalAgentKind;
  status: ExternalAgentStatus;
  description: string;
  capabilities: string[];
  keywords: string[];
  requiredEnv: string[];
  maxAutoRisk: RiskLevel;
  defaultRequiresApproval: boolean;
  allowedOutputs: string[];
  forbiddenActions: string[];
};

export type ExternalAgentHandoff = {
  agentId: string;
  agentName: string;
  kind: ExternalAgentKind;
  status: ExternalAgentStatus;
  matchedCapabilities: string[];
  reason: string;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  allowedOutputs: string[];
  forbiddenActions: string[];
};

const RISK_ORDER: Record<RiskLevel, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };

const EXTERNAL_AGENT_REGISTRY: ExternalAgentSpec[] = [
  {
    id: "github-coding-adapter",
    name: "GitHub Coding Adapter",
    kind: "api",
    status: "needs_config",
    description: "用於讀取 GitHub repo、提出變更建議、建立分支與 PR。第三階段預設只建議，不自動合併。",
    capabilities: ["repo_inspection", "branch_plan", "pull_request_plan", "ci_review"],
    keywords: ["github", "程式", "修復", "workflow", "actions", "bug", "api", "部署", "pr"],
    requiredEnv: ["GITHUB_TOKEN"],
    maxAutoRisk: "L2",
    defaultRequiresApproval: true,
    allowedOutputs: ["受影響檔案清單", "修復計畫", "測試指令", "PR 草稿"],
    forbiddenActions: ["自動合併 PR", "讀取或輸出 Secrets", "未確認前修改 LINE 控制穩定版"],
  },
  {
    id: "hotel-radar-adapter",
    name: "Hotel Radar Adapter",
    kind: "internal_adapter",
    status: "planned",
    description: "用於觸發旅館市場雷達、房價資料彙整與營運定價報告。",
    capabilities: ["hotel_market_scan", "rate_report", "competitor_snapshot", "pricing_brief"],
    keywords: ["旅館", "飯店", "房價", "雷達", "ota", "booking", "agoda", "revpar", "adr", "新寶", "一中館"],
    requiredEnv: ["NUBO_HOTEL_RADAR_ENDPOINT"],
    maxAutoRisk: "L2",
    defaultRequiresApproval: false,
    allowedOutputs: ["市場摘要", "房價表", "HTML 報告", "JSON 資料"],
    forbiddenActions: ["自動改正式售價", "自動上架 OTA", "自動寄送非白名單收件者"],
  },
  {
    id: "browser-research-adapter",
    name: "Browser Research Adapter",
    kind: "mcp",
    status: "planned",
    description: "用於需要即時網頁資料、來源交叉檢查與截圖證據的研究任務。",
    capabilities: ["web_search", "source_check", "page_summary", "evidence_capture"],
    keywords: ["查", "搜尋", "最新", "價格", "法規", "新聞", "研究", "比價", "來源"],
    requiredEnv: ["NUBO_BROWSER_MCP_URL"],
    maxAutoRisk: "L2",
    defaultRequiresApproval: false,
    allowedOutputs: ["來源摘要", "引用清單", "資訊缺口", "研究報告"],
    forbiddenActions: ["登入未知網站", "提交表單", "付款", "下載不明檔案"],
  },
  {
    id: "document-artifact-adapter",
    name: "Document Artifact Adapter",
    kind: "internal_adapter",
    status: "available",
    description: "用於產出 Markdown、HTML、JSON 檔案；PDF 由 HTML 列印或後續專用轉檔器處理。",
    capabilities: ["markdown_export", "html_export", "json_export", "artifact_index"],
    keywords: ["pdf", "html", "word", "excel", "附件", "檔案", "報告", "匯出", "下載"],
    requiredEnv: [],
    maxAutoRisk: "L2",
    defaultRequiresApproval: false,
    allowedOutputs: ["Markdown", "HTML", "JSON", "下載連結"],
    forbiddenActions: ["覆蓋使用者原始檔", "輸出 Secrets", "未驗證卻宣稱 PDF 已完成"],
  },
  {
    id: "gmail-calendar-adapter",
    name: "Gmail Calendar Adapter",
    kind: "api",
    status: "needs_config",
    description: "用於 Gmail 草稿、白名單寄送、信件摘要與 Google Calendar 排程。",
    capabilities: ["gmail_draft", "gmail_send_whitelist", "email_summary", "calendar_event_plan"],
    keywords: ["gmail", "email", "寄信", "草稿", "信件", "行事曆", "calendar", "排程", "提醒"],
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    maxAutoRisk: "L2",
    defaultRequiresApproval: true,
    allowedOutputs: ["Gmail 草稿", "收件匣通知", "排程計畫"],
    forbiddenActions: ["寄送非白名單對象", "刪除信件", "讀取超出任務範圍的郵件"],
  },
  {
    id: "home-assistant-device-adapter",
    name: "Home Assistant Device Adapter",
    kind: "api",
    status: "needs_config",
    description: "用於智慧家庭、燈具、插座與場景控制；高風險設備動作需人工確認。",
    capabilities: ["device_status", "scene_plan", "safe_device_control"],
    keywords: ["home assistant", "燈", "插座", "tapo", "google 音箱", "設備", "開燈", "關燈"],
    requiredEnv: ["HOME_ASSISTANT_URL", "HOME_ASSISTANT_TOKEN"],
    maxAutoRisk: "L2",
    defaultRequiresApproval: true,
    allowedOutputs: ["設備狀態", "場景建議", "安全控制計畫"],
    forbiddenActions: ["解除安全設備", "未確認前長時間通電", "改變門鎖或警報系統"],
  },
];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isRiskAbove(taskRisk: RiskLevel, maxAutoRisk: RiskLevel) {
  return RISK_ORDER[taskRisk] > RISK_ORDER[maxAutoRisk];
}

function statusRequiresApproval(status: ExternalAgentStatus) {
  return status !== "available";
}

export function listExternalAgents() {
  return EXTERNAL_AGENT_REGISTRY;
}

export function recommendExternalAgentHandoffs(
  instruction: string,
  internalAgents: AgentRole[],
  riskLevel: RiskLevel,
): ExternalAgentHandoff[] {
  const text = `${instruction}\n${internalAgents.join(" ")}`.toLowerCase();

  return EXTERNAL_AGENT_REGISTRY
    .map((agent) => {
      const keywordMatched = includesAny(text, agent.keywords);
      const capabilityMatched = agent.capabilities.filter((capability) =>
        includesAny(text, [capability.replace(/_/g, " "), capability]),
      );
      const roleMatched =
        (internalAgents.includes("coding") && agent.id === "github-coding-adapter") ||
        (internalAgents.includes("research") && agent.id === "browser-research-adapter") ||
        (internalAgents.includes("report") && agent.id === "document-artifact-adapter") ||
        (internalAgents.includes("mail") && agent.id === "gmail-calendar-adapter") ||
        (internalAgents.includes("device") && agent.id === "home-assistant-device-adapter") ||
        (internalAgents.includes("data") && agent.id === "hotel-radar-adapter");

      if (!keywordMatched && !roleMatched && capabilityMatched.length === 0) return null;

      const requiresApproval =
        agent.defaultRequiresApproval ||
        statusRequiresApproval(agent.status) ||
        isRiskAbove(riskLevel, agent.maxAutoRisk);

      return {
        agentId: agent.id,
        agentName: agent.name,
        kind: agent.kind,
        status: agent.status,
        matchedCapabilities: capabilityMatched.length > 0 ? capabilityMatched : agent.capabilities.slice(0, 3),
        reason: roleMatched
          ? "內部代理人角色顯示此任務可由該外部/Adapter 代理人補強。"
          : "任務關鍵字命中此代理人的能力範圍。",
        requiresApproval,
        riskLevel,
        allowedOutputs: agent.allowedOutputs,
        forbiddenActions: agent.forbiddenActions,
      } satisfies ExternalAgentHandoff;
    })
    .filter((item): item is ExternalAgentHandoff => Boolean(item))
    .slice(0, 4);
}

export function formatExternalHandoffSection(handoffs: ExternalAgentHandoff[]) {
  if (handoffs.length === 0) return "無建議外部代理人；使用內部代理人即可完成。";
  return handoffs
    .map(
      (handoff, index) =>
        `${index + 1}. ${handoff.agentName}（${handoff.status}｜${handoff.kind}）\n` +
        `   原因：${handoff.reason}\n` +
        `   可輸出：${handoff.allowedOutputs.join("、")}\n` +
        `   禁止：${handoff.forbiddenActions.join("、")}\n` +
        `   授權：${handoff.requiresApproval ? "需要人工確認" : "可在 L1/L2 範圍內自動使用"}`,
    )
    .join("\n");
}
