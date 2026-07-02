import fs from "node:fs";
import path from "node:path";

const automationsPath = path.join(process.cwd(), "lib", "v12", "v12-automations.json");

export type V12AutomationStatus = "active" | "paused" | "draft";
export type V12RiskLevel = "low" | "medium" | "high";

export type V12Automation = {
  id: string;
  name: string;
  description: string;
  status: V12AutomationStatus;
  riskLevel: V12RiskLevel;
  steps: string[];
  createdAt: string;
};

type AutomationStore = {
  automations: V12Automation[];
};

function defaultStore(): AutomationStore {
  return {
    automations: [
      {
        id: "auto_light_control",
        name: "智慧家庭控制",
        description: "透過語音、按鈕或 Automation Executor 控制投射燈，並寫入活動紀錄。",
        status: "active",
        riskLevel: "low",
        steps: ["Trigger", "Intent", "Smart Home API", "IFTTT", "Device", "Log"],
        createdAt: "system",
      },
    ],
  };
}

function ensureFile() {
  const dir = path.dirname(automationsPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(automationsPath)) {
    fs.writeFileSync(automationsPath, JSON.stringify(defaultStore(), null, 2), "utf8");
  }
}

export function readAutomationStore(): AutomationStore {
  try {
    ensureFile();
    const raw = fs.readFileSync(automationsPath, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      automations: Array.isArray(parsed.automations) ? parsed.automations : [],
    };
  } catch {
    const safe = defaultStore();
    fs.writeFileSync(automationsPath, JSON.stringify(safe, null, 2), "utf8");
    return safe;
  }
}

export function writeAutomationStore(data: AutomationStore) {
  ensureFile();

  const safe: AutomationStore = {
    automations: Array.isArray(data.automations) ? data.automations : [],
  };

  fs.writeFileSync(automationsPath, JSON.stringify(safe, null, 2), "utf8");
}

export function createAutomation(input: {
  name: string;
  description?: string;
  riskLevel?: V12RiskLevel;
  steps?: string[];
}) {
  const store = readAutomationStore();

  const automation: V12Automation = {
    id: `auto_${Date.now()}`,
    name: input.name,
    description: input.description || "尚未填寫描述。",
    status: "draft",
    riskLevel: input.riskLevel || "low",
    steps: input.steps?.length ? input.steps : ["Trigger", "Brain", "Action", "Log"],
    createdAt: new Date().toLocaleString("zh-TW", { hour12: false }),
  };

  writeAutomationStore({
    automations: [automation, ...store.automations],
  });

  return automation;
}

export function updateAutomationStatus(id: string, status: V12AutomationStatus) {
  const store = readAutomationStore();

  const automations = store.automations.map((item) =>
    item.id === id ? { ...item, status } : item
  );

  writeAutomationStore({ automations });

  return automations.find((item) => item.id === id) || null;
}

export function deleteAutomation(id: string) {
  const store = readAutomationStore();

  const before = store.automations.length;
  const automations = store.automations.filter((item) => item.id !== id);

  writeAutomationStore({ automations });

  return {
    deleted: before !== automations.length,
  };
}
