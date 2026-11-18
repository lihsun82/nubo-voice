import { createNubosciVoiceSessionHandler } from "@/lib/nubosci-voice-session";
import { pmsFresh, readPmsSnapshot } from "@/lib/pms-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createNubosciVoiceSessionHandler({
  enablePmsTools: process.env.NUBOSCI_PMS_VOICE_TOOLS_ENABLED === "true",
  availabilityProvider: async () => {
    const snapshot = await readPmsSnapshot();
    return pmsFresh(snapshot) && snapshot
      ? { generatedAt: snapshot.generatedAt, availability: snapshot.availability }
      : null;
  },
  partnerKeySha256: process.env.NUBOSCI_VOICE_PARTNER_KEY_SHA256,
  geminiApiKey: process.env.GEMINI_API_KEY,
});
