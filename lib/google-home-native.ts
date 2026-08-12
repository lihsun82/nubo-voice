"use client";

export type GoogleHomeRoom = {
  structureId: string;
  structure: string;
  roomId: string;
  room: string;
};

export type GoogleHomeDevice = GoogleHomeRoom & {
  deviceId: string;
  device: string;
  controllable: boolean;
  onSupported?: boolean;
  offSupported?: boolean;
  toggleSupported?: boolean;
  stateSupported?: boolean;
  state?: boolean | null;
};

export type GoogleHomePayload = {
  requestId?: string;
  ok?: boolean;
  available?: boolean;
  enabled?: boolean;
  status?: string;
  mode?: "native" | "webhook" | string;
  provider?: string;
  message?: string;
  error?: string;
  rooms?: GoogleHomeRoom[];
  devices?: GoogleHomeDevice[];
  matched?: number;
  controlled?: number;
  failures?: Array<{ device?: string; error?: string }>;
};

type NativeBridge = {
  googleHomeStatus?: () => string;
  googleHomeRequestPermissions?: (requestId: string) => boolean;
  googleHomeListDevices?: (requestId: string) => boolean;
  googleHomeControl?: (
    requestId: string,
    action: "on" | "off",
    roomName: string,
    deviceName: string,
  ) => boolean;
};

const DEFAULT_ROOM_KEY = "nubo_google_home_room_v1";
const RESULT_EVENT = "nubo:google-home-result";
const REQUEST_TIMEOUT_MS = 30_000;

function bridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { NuboNative?: NativeBridge }).NuboNative ?? null);
}

function requestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseStatus(raw: string): GoogleHomePayload {
  try {
    return JSON.parse(raw) as GoogleHomePayload;
  } catch {
    return { ok: false, available: false, error: "Google Home 狀態格式錯誤" };
  }
}

export function getGoogleHomeStatus(): GoogleHomePayload {
  const native = bridge();
  if (!native?.googleHomeStatus) {
    return {
      ok: true,
      available: false,
      enabled: false,
      mode: "webhook",
      message: "正在檢查 Google Home 智慧燈橋接…",
    };
  }
  return { mode: "native", ...parseStatus(native.googleHomeStatus()) };
}

export async function getGoogleHomeBridgeStatus(): Promise<GoogleHomePayload> {
  const nativeStatus = getGoogleHomeStatus();
  if (nativeStatus.available && nativeStatus.enabled) return nativeStatus;

  try {
    const response = await fetch("/api/smart-home/light", {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as GoogleHomePayload;
    if (!response.ok) {
      return {
        ok: false,
        available: false,
        enabled: false,
        mode: "webhook",
        error: payload.error || "Google Home 智慧燈橋接狀態讀取失敗",
      };
    }
    return { mode: "webhook", ...payload };
  } catch (error) {
    return {
      ok: false,
      available: false,
      enabled: false,
      mode: "webhook",
      error: error instanceof Error ? error.message : "Google Home 智慧燈橋接無法連線",
    };
  }
}

function formatFailure(detail: GoogleHomePayload) {
  const failures = (detail.failures ?? [])
    .map((item) => [item.device, item.error].filter(Boolean).join("："))
    .filter(Boolean)
    .join("；");
  const base = detail.error || detail.message || "Google Home 操作失敗";
  return failures ? `${base}｜${failures}` : base;
}

function runNativeRequest(
  invoke: (native: NativeBridge, id: string) => boolean,
): Promise<GoogleHomePayload> {
  const native = bridge();
  if (!native) {
    return Promise.reject(new Error("目前不是 AinuboX1 Android 原生環境"));
  }

  return new Promise((resolve, reject) => {
    const id = requestId();
    const timeout = window.setTimeout(() => {
      window.removeEventListener(RESULT_EVENT, onResult as EventListener);
      reject(new Error("Google Home 回應逾時，請確認 Google Home App、裝置連線與網路狀態。"));
    }, REQUEST_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener(RESULT_EVENT, onResult as EventListener);
    };

    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<GoogleHomePayload>).detail;
      if (!detail || detail.requestId !== id) return;
      cleanup();
      if (detail.ok === false) {
        reject(new Error(formatFailure(detail)));
        return;
      }
      resolve(detail);
    };

    window.addEventListener(RESULT_EVENT, onResult as EventListener);

    try {
      if (!invoke(native, id)) {
        cleanup();
        reject(new Error("AinuboX1 無法啟動 Google Home 原生操作"));
      }
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Google Home 原生操作失敗"));
    }
  });
}

async function runServerControl(options: {
  action: "on" | "off";
  room?: string;
  device?: string;
}) {
  const response = await fetch("/api/smart-home/light", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as GoogleHomePayload;
  if (!response.ok || payload.ok === false) {
    throw new Error(formatFailure(payload));
  }
  return payload;
}

export async function connectGoogleHome() {
  const native = bridge();
  if (!native?.googleHomeRequestPermissions) {
    const status = await getGoogleHomeBridgeStatus();
    if (status.available && status.enabled) {
      return {
        ...status,
        ok: true,
        message: "Google Home 智慧燈橋接已就緒，不需要另外授權。",
      };
    }
    throw new Error(status.error || status.message || "Google Home 尚未完成串接");
  }

  return runNativeRequest((activeNative, id) => {
    if (!activeNative.googleHomeRequestPermissions) return false;
    return activeNative.googleHomeRequestPermissions(id);
  });
}

export async function listGoogleHomeDevices() {
  const native = bridge();
  if (!native?.googleHomeListDevices) {
    const status = await getGoogleHomeBridgeStatus();
    if (status.available && status.enabled) {
      return {
        ...status,
        rooms: [],
        devices: [],
        message: "目前使用智慧燈橋接模式，可直接用語音開燈／關燈。",
      };
    }
    throw new Error(status.error || status.message || "Google Home 尚未完成串接");
  }

  return runNativeRequest((activeNative, id) => {
    if (!activeNative.googleHomeListDevices) return false;
    return activeNative.googleHomeListDevices(id);
  });
}

export function getDefaultGoogleHomeRoom() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DEFAULT_ROOM_KEY)?.trim() ?? "";
}

export function setDefaultGoogleHomeRoom(room: string) {
  if (typeof window === "undefined") return;
  const value = room.trim();
  if (value) window.localStorage.setItem(DEFAULT_ROOM_KEY, value);
  else window.localStorage.removeItem(DEFAULT_ROOM_KEY);
}

export async function controlGoogleHome(options: {
  action: "on" | "off";
  room?: string;
  device?: string;
}) {
  const room = (options.room ?? getDefaultGoogleHomeRoom()).trim();
  const device = (options.device ?? "").trim();
  const native = bridge();

  if (native?.googleHomeControl) {
    if (!room && !device) {
      throw new Error("請先到智慧家庭設定選擇這台 NUBO 所在的房間，避免誤控其他房間。");
    }

    return runNativeRequest((activeNative, id) => {
      if (!activeNative.googleHomeControl) return false;
      return activeNative.googleHomeControl(id, options.action, room, device);
    });
  }

  // Current AinuboX1 APK does not expose the Google Home native methods yet.
  // Keep voice light control functional through the previously configured
  // smart-home webhook bridge rather than failing the whole NUBO command.
  return runServerControl({
    action: options.action,
    room: room || undefined,
    device: device || undefined,
  });
}
