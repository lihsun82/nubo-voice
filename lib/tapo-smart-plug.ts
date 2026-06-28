type TapoAction = "on" | "off" | "toggle";

type TapoDeviceInfo = Record<string, unknown>;

type TapoDevice = {
  turnOn: () => Promise<unknown>;
  turnOff: () => Promise<unknown>;
  getDeviceInfo: () => Promise<TapoDeviceInfo>;
};

type TapoModule = {
  loginDeviceByIp: (email: string, password: string, ip: string) => Promise<TapoDevice>;
};

const DEFAULT_TIMEOUT_MS = 12000;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少環境變數：${name}`);
  return value;
}

function getTapoPassword() {
  const encoded = process.env.NUBO_TAPO_PASSWORD_B64?.trim();
  if (encoded) {
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      if (!decoded) throw new Error("base64解碼後為空");
      return decoded;
    } catch {
      throw new Error("NUBO_TAPO_PASSWORD_B64格式錯誤，請重新產生Base64密碼");
    }
  }

  const value = process.env.NUBO_TAPO_PASSWORD;
  if (!value) throw new Error("缺少環境變數：NUBO_TAPO_PASSWORD 或 NUBO_TAPO_PASSWORD_B64");
  return value;
}

function withTimeout<T>(task: Promise<T>, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return Promise.race([
    task,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Tapo P100連線逾時：${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

function readPowerState(info: TapoDeviceInfo) {
  const candidates = [
    info.device_on,
    info.deviceOn,
    info.on,
    info.powerOn,
    info.power_state,
    info.powerState,
    info.state,
  ];

  for (const value of candidates) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (["on", "true", "1"].includes(normalized)) return true;
      if (["off", "false", "0"].includes(normalized)) return false;
    }
  }

  return null;
}

export function isTapoSmartPlugConfigured() {
  return Boolean(
    process.env.NUBO_TAPO_EMAIL?.trim() &&
      (process.env.NUBO_TAPO_PASSWORD?.length || process.env.NUBO_TAPO_PASSWORD_B64?.trim()) &&
      process.env.NUBO_TAPO_DEVICE_IP?.trim(),
  );
}

export async function controlTapoSmartPlug(action: TapoAction) {
  const email = getRequiredEnv("NUBO_TAPO_EMAIL");
  const password = getTapoPassword();
  const ip = getRequiredEnv("NUBO_TAPO_DEVICE_IP");
  const timeoutMs = Number(process.env.NUBO_TAPO_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  const tapo = (await import("tp-link-tapo-connect")) as unknown as TapoModule;
  const device = await withTimeout(tapo.loginDeviceByIp(email, password, ip), timeoutMs);

  const before = await withTimeout(device.getDeviceInfo(), timeoutMs);
  const beforeOn = readPowerState(before);

  if (action === "on") await withTimeout(device.turnOn(), timeoutMs);
  else if (action === "off") await withTimeout(device.turnOff(), timeoutMs);
  else {
    if (beforeOn === null) {
      throw new Error("無法讀取Tapo P100目前開關狀態，不能安全執行toggle；請改說開燈或關燈。每次開關仍可正常執行。");
    }
    await withTimeout(beforeOn ? device.turnOff() : device.turnOn(), timeoutMs);
  }

  const after = await withTimeout(device.getDeviceInfo(), timeoutMs).catch(() => null);
  const afterOn = after ? readPowerState(after) : null;

  return {
    ok: true,
    provider: "tapo",
    model: "Tapo P100",
    ip,
    action,
    beforeOn,
    afterOn,
  };
}
