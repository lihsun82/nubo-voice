export type NuboAgentId =
  | "brain"
  | "writer"
  | "validator"
  | "research"
  | "mail"
  | "ops"
  | "developer"
  | "home"
  | "calendar";

export type NuboAgentDefinition = {
  id: NuboAgentId;
  name: string;
  role: string;
  description: string;
};

export const nuboAgentRegistry: NuboAgentDefinition[] = [
  {
    id: "brain",
    name: "NUBO Brain",
    role: "任務總管",
    description: "理解需求、拆解步驟、選擇Agent與Skill。",
  },
  {
    id: "writer",
    name: "Writer Agent",
    role: "完整交付寫作",
    description: "產出完整信件、報告、文章、SOP與文件正文。",
  },
  {
    id: "validator",
    name: "Validator Agent",
    role: "成果驗收",
    description: "檢查完整性、格式、資料來源與是否真的完成。",
  },
  {
    id: "research",
    name: "Research Agent",
    role: "資料研究",
    description: "搜尋、比較、查證並整理可執行結論。",
  },
  {
    id: "mail",
    name: "Mail Agent",
    role: "郵件工作",
    description: "處理Gmail搜尋、草稿、預覽與兩階段寄送。",
  },
  {
    id: "ops",
    name: "Hotel Ops Agent",
    role: "旅館營運",
    description: "處理房價行情、營運分析、SOP與管理報告。",
  },
  {
    id: "developer",
    name: "Developer Agent",
    role: "系統與程式",
    description: "分析錯誤、規劃修復、產出可執行技術成果。",
  },
  {
    id: "home",
    name: "Home Agent",
    role: "智慧家庭",
    description: "協調已核准的智慧家庭與裝置控制Skill。",
  },
  {
    id: "calendar",
    name: "Calendar Agent",
    role: "排程與提醒",
    description: "建立與管理一次性、每日、每小時或條件任務。",
  },
];

export function getNuboAgent(id: NuboAgentId) {
  return nuboAgentRegistry.find((agent) => agent.id === id) ?? null;
}
