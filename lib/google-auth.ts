import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";

function getGoogleDataDirectory() {
  const configured = process.env.NUBO_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

const tokenFile = path.join(getGoogleDataDirectory(), "google-auth.json");
const stateFile = path.join(getGoogleDataDirectory(), "google-oauth-state.json");

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
];

type GoogleTokenStore = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
  email?: string;
};

type OAuthStateStore = {
  state: string;
  expiresAt: string;
};

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getRedirectUri() {
  const explicit = optionalEnv("GOOGLE_REDIRECT_URI");
  if (explicit) return explicit;

  const publicUrl = optionalEnv("NUBO_PUBLIC_URL");
  if (publicUrl) {
    return new URL("/api/google/oauth/callback", publicUrl).toString();
  }

  const railwayDomain = optionalEnv("RAILWAY_PUBLIC_DOMAIN");
  if (railwayDomain) {
    return `https://${railwayDomain}/api/google/oauth/callback`;
  }

  return "http://127.0.0.1:3000/api/google/oauth/callback";
}

function getConfig() {
  const clientId = optionalEnv("GOOGLE_CLIENT_ID");
  const clientSecret = optionalEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET 尚未設定");
  }
  return { clientId, clientSecret, redirectUri };
}

async function readTokenStore(): Promise<GoogleTokenStore> {
  const stored = await readJson<GoogleTokenStore>(tokenFile, {});

  return {
    ...stored,
    accessToken: stored.accessToken || optionalEnv("GOOGLE_ACCESS_TOKEN"),
    refreshToken: stored.refreshToken || optionalEnv("GOOGLE_REFRESH_TOKEN"),
    email: stored.email || optionalEnv("GOOGLE_ACCOUNT_EMAIL"),
    scope: stored.scope || optionalEnv("GOOGLE_TOKEN_SCOPE"),
  };
}

async function writeTokenStore(value: GoogleTokenStore) {
  await writeJson(tokenFile, value);
}

export async function createGoogleAuthUrl(): Promise<string> {
  const { clientId, redirectUri } = getConfig();
  const state = `${crypto.randomUUID()}-${Date.now()}`;
  await writeJson<OAuthStateStore>(stateFile, {
    state,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function validateState(state: string): Promise<void> {
  const saved = await readJson<OAuthStateStore | null>(stateFile, null);
  if (!saved || saved.state !== state) throw new Error("OAuth state 驗證失敗");
  if (new Date(saved.expiresAt).getTime() < Date.now()) {
    throw new Error("OAuth state 已過期，請重新連接 Gmail");
  }
  await writeJson(stateFile, { state: "used", expiresAt: new Date(0).toISOString() });
}

async function fetchGoogleEmail(accessToken: string): Promise<string | undefined> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return undefined;
  const payload = await response.json();
  return typeof payload?.email === "string" ? payload.email : undefined;
}

export async function exchangeGoogleCode(code: string, state: string) {
  await validateState(state);
  const { clientId, clientSecret, redirectUri } = getConfig();
  const previous = await readTokenStore();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error(payload?.error_description ?? payload?.error ?? "Google OAuth交換失敗");
  }

  const email = await fetchGoogleEmail(payload.access_token);
  const store: GoogleTokenStore = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? previous.refreshToken,
    expiresAt: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(),
    scope: payload.scope,
    tokenType: payload.token_type,
    email: email ?? previous.email,
  };
  await writeTokenStore(store);
  return store;
}

export async function getGoogleAccessToken(): Promise<string> {
  const store = await readTokenStore();
  const expiresAt = store.expiresAt ? new Date(store.expiresAt).getTime() : 0;
  if (store.accessToken && expiresAt > Date.now() + 60_000) {
    return store.accessToken;
  }
  if (!store.refreshToken) throw new Error("Gmail尚未完成OAuth連接");

  const { clientId, clientSecret } = getConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: store.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || typeof payload?.access_token !== "string") {
    throw new Error(payload?.error_description ?? payload?.error ?? "Google權杖更新失敗");
  }

  const updated: GoogleTokenStore = {
    ...store,
    accessToken: payload.access_token,
    expiresAt: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(),
    scope: payload.scope ?? store.scope,
    tokenType: payload.token_type ?? store.tokenType,
  };
  await writeTokenStore(updated);
  return payload.access_token;
}

export async function googleApiFetch(url: string, init: RequestInit = {}) {
  const accessToken = await getGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers, cache: "no-store" });
}

export async function getGoogleConnectionStatus() {
  const configured = Boolean(
    optionalEnv("GOOGLE_CLIENT_ID") && optionalEnv("GOOGLE_CLIENT_SECRET"),
  );
  const store = await readTokenStore();
  return {
    configured,
    connected: Boolean(store.refreshToken || store.accessToken),
    email: store.email ?? null,
    scopes: store.scope?.split(" ").filter(Boolean) ?? [],
    redirectUri: getRedirectUri(),
    persistentStorage: Boolean(
      optionalEnv("NUBO_DATA_DIR") || optionalEnv("GOOGLE_REFRESH_TOKEN"),
    ),
  };
}
