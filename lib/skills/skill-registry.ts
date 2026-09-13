import type { NuboAgentId } from "@/lib/agents/agent-registry";

export type NuboSkillDefinition = {
  id: string;
  name: string;
  agent: NuboAgentId;
  description: string;
  keywords: string[];
  risk: "read" | "write" | "external";
  approved: boolean;
};

export const nuboSkillRegistry: NuboSkillDefinition[] = [
  {
    id: "complete-writing",
    name: "完整內容產出",
    agent: "writer",
    description: "完整撰寫信件、文章、報告、SOP與長文，不得省略。",
    keywords: ["完整", "全文", "寫", "產出", "文章", "報告", "sop", "內容", "信件"],
    risk: "read",
    approved: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    agent: "mail",
    description: "搜尋、讀取、建立草稿與兩階段確認寄信。",
    keywords: ["gmail", "郵件", "信件", "寄信", "收件者", "草稿"],
    risk: "external",
    approved: true,
  },
  {
    id: "hotel-radar",
    name: "旅館行情雷達",
    agent: "ops",
    description: "讀取或更新台中一中與台北忠孝復興房價行情。",
    keywords: ["旅館", "飯店", "行情", "房價", "競品", "一中館", "忠孝復興", "新寶智慧"],
    risk: "read",
    approved: true,
  },
  {
    id: "research",
    name: "即時研究",
    agent: "research",
    description: "搜尋最新資料、比較方案、查證來源。",
    keywords: ["搜尋", "研究", "查證", "最新", "比較", "分析", "資料", "新聞"],
    risk: "read",
    approved: true,
  },
  {
    id: "task-scheduler",
    name: "任務排程",
    agent: "calendar",
    description: "建立一次性、每日、每小時或週期性工作。",
    keywords: ["提醒", "每天", "每小時", "排程", "定期", "自動", "任務", "交辦"],
    risk: "write",
    approved: true,
  },
  {
    id: "developer",
    name: "程式與系統診斷",
    agent: "developer",
    description: "分析程式、錯誤、部署與修復方案。",
    keywords: ["程式", "錯誤", "修復", "github", "railway", "api", "部署", "系統"],
    risk: "write",
    approved: true,
  },
  {
    id: "smart-home",
    name: "智慧家庭",
    agent: "home",
    description: "使用已核准的裝置與智慧家庭控制能力。",
    keywords: ["開燈", "關燈", "燈", "tapo", "智慧家庭", "音量", "亮度"],
    risk: "external",
    approved: true,
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function findApprovedSkills(instruction: string, limit = 4) {
  const text = normalize(instruction);
  return nuboSkillRegistry
    .filter((skill) => skill.approved)
    .map((skill) => ({
      skill,
      score: skill.keywords.reduce(
        (total, keyword) => total + (text.includes(normalize(keyword)) ? 1 : 0),
        0,
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.skill);
}
