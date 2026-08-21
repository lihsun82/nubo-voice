import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = 'NUBO_WEB_SENSE_NATIVE_GUARD_V1';

if (!source.includes(marker)) {
  if (!source.includes('NUBO_WEB_SENSE_MAIN_VOICE_V1')) {
    throw new Error('sense native guard: Web Sense V1 must run first');
  }
  const anchor = `      const type = String(detail?.type ?? "").trim();\n      if (!type || silentUntilWakeRef.current || ecoSleepingRef.current) return;`;
  const replacement = `      const type = String(detail?.type ?? "").trim();\n      // ${marker}: Android Sense already owns its native response path.\n      // Only pure-Web YAMNet events should be handed to the Web main voice.\n      const senseSource = String(\n        (detail as { source?: string } | undefined)?.source ?? "",\n      );\n      if (senseSource !== "web-yamnet") return;\n      if (!type || silentUntilWakeRef.current || ecoSleepingRef.current) return;`;
  if (!source.includes(anchor)) {
    throw new Error('sense native guard: event source anchor missing');
  }
  source = source.replace(anchor, replacement);
  fs.writeFileSync(path, source);
}

console.log('Applied Web Sense native duplicate-response guard');
