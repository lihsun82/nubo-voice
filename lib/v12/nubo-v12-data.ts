export type NuboAgentStatus = "idle" | "active" | "warning" | "error";

export type NuboAgent = {
  id: string;
  name: string;
  role: string;
  status: NuboAgentStatus;
  description: string;
};

export type NuboActivity = {
  id: string;
  time: string;
  source: string;
  action: string;
  status: "success" | "warning" | "error" | "pending";
  detail: string;
};

export type NuboAutomation = {
  id: string;
  name: string;
  flow: string[];
  status: "active" | "paused" | "draft";
};

export const nuboAgents: NuboAgent[] = [
  {
    id: "brain",
    name: "NUBO Brain",
    role: "主控 AI",
    status: "active",
    description: "負責理解語音、判斷意圖、分派任務。"
  },
  {
    id: "home",
    name: "NUBO Home",
    role: "智慧家庭",
    status: "warning",
    description: "控制投射燈、Tapo、Google Home、Home Assistant。"
  },
  {
    id: "research",
    name: "Researcher",
    role: "研究分析",
    status: "idle",
    description: "搜尋資料、整理重點、產出報告。"
  },
  {
    id: "ops",
    name: "Ops",
    role: "旅館營運",
    status: "idle",
    description: "處理旅館 SOP、房務、客訴、營運週報。"
  },
  {
    id: "mail",
    name: "Mail",
    role: "郵件助理",
    status: "idle",
    description: "讀取 Gmail、草稿、摘要與待回覆信件。"
  },
  {
    id: "calendar",
    name: "Calendar",
    role: "行事曆",
    status: "idle",
    description: "管理日程、提醒、每日簡報。"
  },
  {
    id: "dev",
    name: "Developer",
    role: "系統維護",
    status: "active",
    description: "追蹤錯誤、開發紀錄、API 狀態。"
  },
  {
    id: "memory",
    name: "Memory",
    role: "長期記憶",
    status: "idle",
    description: "記錄偏好、常用指令、成功與失敗經驗。"
  }
];

export const nuboActivities: NuboActivity[] = [
  {
    id: "a1",
    time: "剛剛",
    source: "Smart Home",
    action: "投射燈控制",
    status: "warning",
    detail: "已送出開燈指令，但仍需確認 Tapo / IFTTT 是否有自動關閉規則。"
  },
  {
    id: "a2",
    time: "今日",
    source: "NUBO API",
    action: "/api/smart-home/light",
    status: "success",
    detail: "Webhook 已成功觸發 tapo_p100_on / tapo_p100_off。"
  },
  {
    id: "a3",
    time: "今日",
    source: "System",
    action: "NUBO V12 初始化",
    status: "pending",
    detail: "Automation Command Center 已建立。"
  }
];

export const nuboAutomations: NuboAutomation[] = [
  {
    id: "auto-briefing",
    name: "每日晨間簡報",
    status: "draft",
    flow: ["Trigger", "Gather", "Brain", "Notify", "Learn"]
  },
  {
    id: "auto-light",
    name: "智慧家庭控制",
    status: "active",
    flow: ["Voice", "Intent", "API", "IFTTT", "Device", "Log"]
  },
  {
    id: "auto-weekly",
    name: "每週營運回顧",
    status: "draft",
    flow: ["Schedule", "Collect", "Analyze", "Report", "Review"]
  }
];
