import fs from "node:fs";

const marker = "NUBO_COMPLAINT_SESSION_LOCK_V2";
const storageKey = "nubo_complaint_intake_v3";
const lastSentKey = "nubo_complaint_last_sent_v3";
const cooldownMs = 3 * 60_000;

function complaintLockSnippet(indent = "  ") {
  return `${indent}if (typeof window !== \"undefined\") {\n${indent}  try {\n${indent}    const raw = window.localStorage.getItem(\"${storageKey}\");\n${indent}    const state = raw ? (JSON.parse(raw) as { active?: boolean }) : null;\n${indent}    const lastRaw = window.localStorage.getItem(\"${lastSentKey}\");\n${indent}    const last = lastRaw ? (JSON.parse(lastRaw) as { at?: number }) : null;\n${indent}    const recentlySent = Boolean(last?.at && Date.now() - Number(last.at) < ${cooldownMs});\n${indent}    if (state?.active || recentlySent) {\n${indent}      return true;\n${indent}    }\n${indent}  } catch {\n${indent}    // Ignore malformed local state and preserve normal guest-service behavior.\n${indent}  }\n${indent}}\n${indent}return false;`;
}

function patchBrowserTools() {
  const path = "lib/browser-nubo-tools-line.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const anchor = "async function sendGuestServiceAlert(args: Record<string, unknown>) {";
  if (!source.includes(anchor)) {
    throw new Error("complaint session lock: guest service tool anchor missing");
  }

  const helper = `// ${marker}: prevent alternate LINE paths while complaint intake is active\n// or immediately after the deterministic collector has already delivered it.\nfunction isNuboComplaintLineLocked() {\n${complaintLockSnippet("  ")}\n}\n\n`;
  source = source.replace(anchor, `${helper}${anchor}`);

  const guardedAnchor = `${anchor}\n`;
  const guarded = `${guardedAnchor}  if (isNuboComplaintLineLocked()) {\n    return {\n      ok: true,\n      sent: false,\n      suppressed: \"complaint-intake-locked\",\n    };\n  }\n`;
  source = source.replace(guardedAnchor, guarded);

  fs.writeFileSync(path, source);
}

function patchRawAudio() {
  const path = "lib/browser-audio.ts";
  let source = fs.readFileSync(path, "utf8");

  // The authoritative complaint-audio patch intentionally consumes/replaces this
  // temporary lock block so raw audio can collect the missing complaint fields.
  // On a second patch pass (CI typecheck -> build) that authoritative marker is the
  // canonical proof that this step has already been applied and superseded.
  if (
    source.includes(marker) ||
    source.includes("NUBO_COMPLAINT_AUDIO_AUTHORITATIVE_V1")
  ) {
    return;
  }

  const anchor = "    if (totalBytes < NUBO_GUEST_AUDIO_MIN_BYTES || chunks.length === 0) return;";
  if (!source.includes(anchor)) {
    throw new Error("complaint session lock: raw-audio flush anchor missing");
  }

  const guard = `    // ${marker}: raw-audio remains available for normal guest requests,\n    // but it may not create intermediate or post-send duplicate alerts for complaints.\n    if (typeof window !== \"undefined\") {\n      try {\n        const raw = window.localStorage.getItem(\"${storageKey}\");\n        const state = raw ? (JSON.parse(raw) as { active?: boolean }) : null;\n        const lastRaw = window.localStorage.getItem(\"${lastSentKey}\");\n        const last = lastRaw ? (JSON.parse(lastRaw) as { at?: number }) : null;\n        const recentlySent = Boolean(last?.at && Date.now() - Number(last.at) < ${cooldownMs});\n        if (state?.active || recentlySent) {\n          console.info(\"[guest-audio-second-pass] suppressed by complaint session lock\", {\n            active: Boolean(state?.active),\n            recentlySent,\n          });\n          return;\n        }\n      } catch {\n        // Ignore malformed local state and keep normal audio fallback behavior.\n      }\n    }\n\n${anchor}`;

  source = source.replace(anchor, guard);
  fs.writeFileSync(path, source);
}

patchBrowserTools();
patchRawAudio();
console.log("Applied complaint session global LINE lock v2");
