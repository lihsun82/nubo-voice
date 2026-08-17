import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
let s = fs.readFileSync(path, 'utf8');

const importAnchor = 'import { sendTranscriptToNameAlert } from "@/lib/nubo-name-alert-client";';
const intakeImport = 'import { processNuboGuestServiceTranscript } from "@/lib/nubo-guest-service-auto-intake";';
if (!s.includes(intakeImport)) {
  if (!s.includes(importAnchor)) throw new Error('Guest service fallback: import anchor missing');
  s = s.replace(importAnchor, `${importAnchor}\n${intakeImport}`);
}

if (!s.includes('NUBO_GUEST_SERVICE_DETERMINISTIC_FALLBACK_V2')) {
  const anchor = `notifyNuboVoicePhase("thinking");\n\nvoid sendTranscriptToNameAlert(trimmedUserText);\n\nacknowledgeQuestion(trimmedUserText);`;
  const patch = `notifyNuboVoicePhase("thinking");\n\nvoid sendTranscriptToNameAlert(trimmedUserText);\n\n// NUBO_GUEST_SERVICE_DETERMINISTIC_FALLBACK_V2\n// Do not rely exclusively on a probabilistic model tool call for hotel complaints.\n// Accumulate surname/room/contact/issue from the user's own transcript and send once\n// all four required fields are present. Server-side delivery dedupe makes this safe\n// alongside the normal guest_service_alert tool path.\nvoid processNuboGuestServiceTranscript(trimmedUserText).catch((cause) => {\n  console.warn("NUBO deterministic guest-service fallback failed", cause);\n});\n\nacknowledgeQuestion(trimmedUserText);`;
  if (!s.includes(anchor)) throw new Error('Guest service fallback: transcript anchor missing');
  s = s.replace(anchor, patch);
}

if (!s.includes(intakeImport)) throw new Error('Guest service fallback import missing after patch');
if (!s.includes('processNuboGuestServiceTranscript(trimmedUserText)')) {
  throw new Error('Guest service fallback call missing after patch');
}

fs.writeFileSync(path, s);
console.log('Applied NUBO guest-service deterministic fallback v2');
