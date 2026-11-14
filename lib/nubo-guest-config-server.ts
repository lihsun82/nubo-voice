import path from "node:path";
import { z } from "zod";
import { readJson, writeJson } from "@/lib/json-store";
import {
  NUBO_GEMINI_VOICES,
  NUBO_OPENAI_VOICES,
  type NuboVoiceProfile,
} from "@/lib/nubo-voice-profile-base";
import type { NuboVoiceTuning } from "@/lib/nubo-voice-tuning";

const CONFIG_FILE = path.join(process.env.NUBO_DATA_DIR || path.join(process.cwd(), "data"), "nubo-guest-config.json");
const DEFAULT_WAKE_WORDS = ["嗨nubo", "嗨 nubo", "ha nubo", "nubo", "兄弟", "有人嗎"];

const voiceProfileSchema = z.object({
  engine: z.enum(["gemini", "openai"]),
  voice: z.string().min(1).max(40),
  personality: z.enum(["professional", "companion", "playful", "minimal"]),
}).strict().refine((profile) => {
  const options = profile.engine === "gemini" ? NUBO_GEMINI_VOICES : NUBO_OPENAI_VOICES;
  return options.some((option) => option.id === profile.voice);
}, "聲線與語音核心不相容");

const voiceTuningSchema = z.object({
  speed: z.number().min(0.85).max(1.15),
  brightness: z.number().min(-8).max(8),
  warmth: z.number().min(-8).max(8),
  presence: z.number().min(-8).max(8),
  compression: z.number().min(0).max(100),
  outputGain: z.number().min(0.7).max(1.3),
  cadence: z.number().min(0).max(100),
  emotion: z.number().min(0).max(100),
  fillers: z.number().min(0).max(100),
  relaxed: z.number().min(0).max(100),
  perceivedPitch: z.number().min(-30).max(30),
}).strict();

export const guestConfigPatchSchema = z.object({
  musicEnabled: z.boolean().optional(),
  idleSeconds: z.number().int().min(10).max(300).optional(),
  wakeWords: z.array(z.string().trim().min(2).max(30)).min(1).max(12).optional(),
  voiceProfile: voiceProfileSchema.nullable().optional(),
  voiceTuning: voiceTuningSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "沒有可更新的設定");

export type NuboGuestConfig = {
  revision: number;
  updatedAt: string;
  musicEnabled: boolean;
  idleSeconds: number;
  wakeWords: string[];
  voiceProfile: NuboVoiceProfile | null;
  voiceTuning: NuboVoiceTuning | null;
};

export const DEFAULT_GUEST_CONFIG: NuboGuestConfig = {
  revision: 1,
  updatedAt: "",
  musicEnabled: false,
  idleSeconds: 30,
  wakeWords: DEFAULT_WAKE_WORDS,
  voiceProfile: null,
  voiceTuning: null,
};

export async function readGuestConfig(): Promise<NuboGuestConfig> {
  const saved = await readJson<unknown>(CONFIG_FILE, null);
  if (!saved || typeof saved !== "object") return { ...DEFAULT_GUEST_CONFIG };
  const record = saved as Record<string, unknown>;
  const parsed = guestConfigPatchSchema.safeParse({
    musicEnabled: record.musicEnabled,
    idleSeconds: record.idleSeconds,
    wakeWords: record.wakeWords,
    voiceProfile: record.voiceProfile,
    voiceTuning: record.voiceTuning,
  });
  if (!parsed.success) return { ...DEFAULT_GUEST_CONFIG };
  return {
    ...DEFAULT_GUEST_CONFIG,
    ...parsed.data,
    revision: typeof record.revision === "number" && Number.isFinite(record.revision)
      ? record.revision : 1,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  } as NuboGuestConfig;
}

export async function updateGuestConfig(value: unknown): Promise<NuboGuestConfig> {
  const patch = guestConfigPatchSchema.parse(value);
  const current = await readGuestConfig();
  const next: NuboGuestConfig = {
    ...current,
    ...patch,
    revision: Math.max(current.revision + 1, Date.now()),
    updatedAt: new Date().toISOString(),
  } as NuboGuestConfig;
  await writeJson(CONFIG_FILE, next);
  return next;
}
