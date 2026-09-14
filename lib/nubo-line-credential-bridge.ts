import net from "node:net";

const ACCESS_TOKEN_KEY = "nubo:line:access_token";
const TARGET_ID_KEY = "nubo:line:target_id";
const CACHE_MS = 60_000;

type BridgeCredentials = {
  accessToken: string;
  targetIds: string[];
};

let cached: { value: BridgeCredentials | null; expiresAt: number } | null = null;

function bridgeConfig() {
  const host = process.env.NUBO_LINE_BRIDGE_HOST?.trim() || "";
  const portRaw = Number(process.env.NUBO_LINE_BRIDGE_PORT ?? 6379);
  const port = Number.isFinite(portRaw) ? Math.max(1, Math.min(65535, Math.floor(portRaw))) : 6379;
  return { host, port };
}

function encodeRedisCommand(parts: string[]) {
  const chunks: Buffer[] = [Buffer.from(`*${parts.length}\r\n`, "utf8")];
  for (const part of parts) {
    const value = Buffer.from(part, "utf8");
    chunks.push(Buffer.from(`$${value.length}\r\n`, "utf8"), value, Buffer.from("\r\n", "utf8"));
  }
  return Buffer.concat(chunks);
}

async function redisGet(key: string): Promise<string> {
  const { host, port } = bridgeConfig();
  if (!host) return "";

  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (error?: Error, value = "") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.setTimeout(3_000);
    socket.on("timeout", () => finish(new Error("LINE credential bridge timeout")));
    socket.on("error", (error) => finish(error));
    socket.on("connect", () => {
      socket.write(encodeRedisCommand(["GET", key]));
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const lineEnd = buffer.indexOf("\r\n");
      if (lineEnd < 0) return;

      const header = buffer.subarray(0, lineEnd).toString("utf8");
      if (header === "$-1") {
        finish(undefined, "");
        return;
      }
      if (header.startsWith("-")) {
        finish(new Error("LINE credential bridge Redis error"));
        return;
      }
      if (!header.startsWith("$")) {
        finish(new Error("LINE credential bridge invalid response"));
        return;
      }

      const length = Number(header.slice(1));
      if (!Number.isFinite(length) || length < 0) {
        finish(new Error("LINE credential bridge invalid length"));
        return;
      }
      const bodyStart = lineEnd + 2;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd + 2) return;
      finish(undefined, buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
    });
  });
}

function splitTargets(raw: string) {
  return raw
    .replace(/;/g, ",")
    .replace(/\n/g, ",")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isLineCredentialBridgeConfigured() {
  return Boolean(bridgeConfig().host);
}

export async function getLineBridgeCredentials(): Promise<BridgeCredentials | null> {
  if (!isLineCredentialBridgeConfigured()) return null;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const [accessToken, targetRaw] = await Promise.all([
      redisGet(ACCESS_TOKEN_KEY),
      redisGet(TARGET_ID_KEY),
    ]);
    const targetIds = Array.from(new Set(splitTargets(targetRaw)));
    const value = accessToken && targetIds.length ? { accessToken, targetIds } : null;
    cached = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch (error) {
    console.warn("[LINE bridge] private credential read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    cached = { value: null, expiresAt: Date.now() + 5_000 };
    return null;
  }
}
