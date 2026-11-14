import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "nubo_admin_session";
const SESSION_MS = 7 * 24 * 60 * 60_000;
const SECRET_FILE = path.join(process.env.NUBO_DATA_DIR || path.join(process.cwd(), "data"), "nubo-admin-session-key");
let cachedSecret: string | null = null;
let cachedKeys: { expiresAt: number; keys: Array<Record<string, string>> } | null = null;

function ownerEmail() {
  return (process.env.NUBO_ADMIN_GOOGLE_EMAIL || "").trim().toLowerCase();
}

async function sessionSecret() {
  const configured = process.env.NUBO_ADMIN_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (cachedSecret.length >= 32) return cachedSecret;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(SECRET_FILE), { recursive: true });
  const generated = randomBytes(48).toString("base64url");
  try {
    await fs.writeFile(SECRET_FILE, generated, { flag: "wx", mode: 0o600 });
    cachedSecret = generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    cachedSecret = (await fs.readFile(SECRET_FILE, "utf8")).trim();
  }
  return cachedSecret;
}

async function googleKeys() {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("無法取得 Google 驗證金鑰");
  const payload = await response.json() as { keys?: Array<Record<string, string>> };
  if (!Array.isArray(payload.keys)) throw new Error("Google 驗證金鑰格式錯誤");
  cachedKeys = { keys: payload.keys, expiresAt: Date.now() + 45 * 60_000 };
  return payload.keys;
}

function decodeJwtPart(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

export async function verifyGoogleAdminCredential(credential: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const allowedEmail = ownerEmail();
  if (!clientId || !allowedEmail) throw new Error("Google 後台登入尚未設定");
  if (credential.length > 12000) throw new Error("Google 登入憑證無效");
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Google 登入憑證無效");
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Google 登入簽章無效");
  const key = (await googleKeys()).find((item) => item.kid === header.kid && item.kty === "RSA");
  if (!key || !verify(
    "RSA-SHA256",
    Buffer.from(parts[0] + "." + parts[1]),
    createPublicKey({ key: key as JsonWebKey, format: "jwk" }),
    Buffer.from(parts[2], "base64url"),
  )) throw new Error("Google 登入簽章無效");
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.aud !== clientId ||
    (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") ||
    typeof claims.exp !== "number" || claims.exp <= now ||
    (typeof claims.nbf === "number" && claims.nbf > now) ||
    claims.email_verified !== true ||
    typeof claims.sub !== "string" || !claims.sub ||
    typeof claims.email !== "string" || claims.email.toLowerCase() !== allowedEmail
  ) throw new Error("這個 Google 帳號沒有 NUBO 後台權限");
  return { email: claims.email.toLowerCase(), sub: claims.sub };
}

export function isSameOriginAdminWrite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (request.headers.get("x-nubo-admin-action") !== "1") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const publicOrigin = new URL(process.env.NUBO_PUBLIC_URL || "https://nubo.ainubo.com").origin;
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const sameHost = forwardedHost && source.host.toLowerCase() === forwardedHost.toLowerCase();
    return source.origin === publicOrigin || Boolean(sameHost && source.protocol === "https:");
  } catch {
    return false;
  }
}

export async function setAdminSession(response: NextResponse, identity: { email: string; sub: string }) {
  const payload = Buffer.from(JSON.stringify({
    email: identity.email, sub: identity.sub, expiresAt: Date.now() + SESSION_MS,
  })).toString("base64url");
  const mac = createHmac("sha256", await sessionSecret()).update(payload).digest("base64url");
  response.cookies.set(COOKIE_NAME, payload + "." + mac, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MS / 1000,
  });
}

export function clearAdminSession(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0,
  });
}

export async function getAdminSession(request: NextRequest) {
  const raw = request.cookies.get(COOKIE_NAME)?.value || "";
  const parts = raw.split(".");
  if (parts.length !== 2 || !ownerEmail()) return null;
  const expected = createHmac("sha256", await sessionSecret()).update(parts[0]).digest();
  const received = Buffer.from(parts[1], "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = decodeJwtPart(parts[0]);
    if (
      payload.email !== ownerEmail() ||
      typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.expiresAt !== "number" || payload.expiresAt <= Date.now()
    ) return null;
    return { email: payload.email as string, sub: payload.sub };
  } catch {
    return null;
  }
}
