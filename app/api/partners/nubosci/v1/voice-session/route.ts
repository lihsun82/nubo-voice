import { createNubosciVoiceSessionHandler } from "@/lib/nubosci-voice-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createNubosciVoiceSessionHandler({
  partnerKeySha256: process.env.NUBOSCI_VOICE_PARTNER_KEY_SHA256,
  geminiApiKey: process.env.GEMINI_API_KEY,
});
