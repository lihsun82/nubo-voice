import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";

const FILE = path.join(process.env.NUBO_DATA_DIR || path.join(process.cwd(), "data"), "nubo-guest-pairing.json");
const CODE_MS = 10 * 60_000;
const attempts = new Map<string, { startedAt: number; count: number }>();

type SavedCode = { hash: string; expiresAt: number };

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createGuestPairingCode() {
  const code = String(randomInt(1_000_000_000, 10_000_000_000));
  await writeJson<SavedCode>(FILE, { hash: hash(code), expiresAt: Date.now() + CODE_MS });
  return { code, expiresInSeconds: CODE_MS / 1000 };
}

export async function consumeGuestPairingCode(code: string, source: string) {
  const now = Date.now();
  const bucket = attempts.get(source);
  if (bucket && now - bucket.startedAt < CODE_MS && bucket.count >= 5) return false;
  attempts.set(source, bucket && now - bucket.startedAt < CODE_MS
    ? { startedAt: bucket.startedAt, count: bucket.count + 1 }
    : { startedAt: now, count: 1 });
  if (!/^\d{10}$/.test(code)) return false;
  const saved = await readJson<SavedCode | null>(FILE, null);
  if (!saved || saved.expiresAt <= now) return false;
  const expected = Buffer.from(saved.hash, "hex");
  const actual = Buffer.from(hash(code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  await writeJson(FILE, { hash: "", expiresAt: 0 });
  attempts.delete(source);
  return true;
}
