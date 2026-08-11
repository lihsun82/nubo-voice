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
};

type GoogleHomePayload = {
  requestId?: string;
  ok?: boolean;
  available?: boolean;
  enabled?: boolean;
  status?: string;
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
      message: "請使用支援 Google Home 的 AinuboX1 Android APK。",
    };
  }
  return parseStatus(native.googleHomeStatus());
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
      reject(new Error("Google Home 回應逾時，請確認 Google Home App 與網路連線。"));
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
        reject(new Error(detail.error || detail.message || "Google Home 操作失敗"));
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

export async function connectGoogleHome() {
  return runNativeRequest((native, id) => {
    if (!native.googleHomeRequestPermissions) return false;
    return native.googleHomeRequestPermissions(id);
  });
}

export async function listGoogleHomeDevices() {
  return runNativeRequest((native, id) => {
    if (!native.googleHomeListDevices) return false;
    return native.googleHomeListDevices(id);
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

  if (!room && !device) {
    throw new Error("請先到智慧家庭設定選擇這台 NUBO 所在的房間，避免誤控其他房間。");
  }

  return runNativeRequest((native, id) => {
    if (!native.googleHomeControl) return false;
    return native.googleHomeControl(id, options.action, room, device);
  });
}
