import fs from "node:fs";

const marker = "NUBO_COMPLAINT_SESSION_LOCK_V1";
const storageKey = "nubo_complaint_intake_v3";

function patchBrowserTools() {
  const path = "lib/browser-nubo-tools-line.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const anchor = "async function sendGuestServiceAlert(args: Record<string, unknown>) {";
  if (!source.includes(anchor)) {
    throw new Error("complaint session lock: guest service tool anchor missing");
  }

  const guard = `${anchor}\n  // ${marker}: while a complaint intake is active, only the deterministic\n  // three-field collector may send the final LINE notification.\n  if (typeof window !== \"undefined\") {\n    try {\n      const raw = window.localStorage.getItem(\"${storageKey}\");\n      const state = raw ? (JSON.parse(raw) as { active?: boolean }) : null;\n      if (state?.active) {\n        return {\n          ok: true,\n          sent: false,\n          suppressed: \"complaint-intake-active\",\n        };\n      }\n    } catch {\n      // Ignore malformed local state and keep normal guest-service behavior.\n    }\n  }`;

  source = source.replace(anchor, guard);
  fs.writeFileSync(path, source);
}

function patchRawAudio() {
  const path = "lib/browser-audio.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const anchor = "    if (totalBytes < NUBO_GUEST_AUDIO_MIN_BYTES || chunks.length === 0) return;";
  if (!source.includes(anchor)) {
    throw new Error("complaint session lock: raw-audio flush anchor missing");
  }

  const guard = `    // ${marker}: raw-audio is a fallback for normal guest requests only.\n    // During complaint intake, suppress it so intermediate answers cannot create\n    // duplicate amenity/maintenance/frontdesk LINE alerts.\n    if (typeof window !== \"undefined\") {\n      try {\n        const raw = window.localStorage.getItem(\"${storageKey}\");\n        const state = raw ? (JSON.parse(raw) as { active?: boolean }) : null;\n        if (state?.active) {\n          console.info(\"[guest-audio-second-pass] suppressed during complaint intake\");\n          return;\n        }\n      } catch {\n        // Ignore malformed local state and keep normal audio fallback behavior.\n      }\n    }\n\n${anchor}`;

  source = source.replace(anchor, guard);
  fs.writeFileSync(path, source);
}

patchBrowserTools();
patchRawAudio();
console.log("Applied complaint session global LINE lock");
