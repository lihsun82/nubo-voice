import fs from "node:fs";

const marker = "NUBO_COMPLAINT_SHORT_ANSWER_AUDIO_V1";
const path = "lib/browser-audio.ts";
let source = fs.readFileSync(path, "utf8");

if (!source.includes("NUBO_COMPLAINT_AUDIO_AUTHORITATIVE_V1")) {
  throw new Error("complaint short-answer patch: authoritative complaint audio patch must run first");
}

if (!source.includes(marker)) {
  const anchor = `    if (totalBytes < NUBO_GUEST_AUDIO_MIN_BYTES || chunks.length === 0) return;`;
  if (!source.includes(anchor)) {
    throw new Error("complaint short-answer patch: min-bytes anchor missing");
  }

  const patch = `    // ${marker}: single-syllable surnames such as 李/林/陳 and short room replies\n    // can be well under 0.5s. During an active complaint intake only, lower the\n    // raw-audio minimum from 16,000 bytes (~0.5s) to 3,200 bytes (~0.1s).\n    // Normal guest-service requests keep the original threshold.\n    const complaintShortAnswerMode = complaintIntakeSnapshot?.active === true;\n    const guestAudioMinBytes = complaintShortAnswerMode ? 3_200 : NUBO_GUEST_AUDIO_MIN_BYTES;\n    if (totalBytes < guestAudioMinBytes || chunks.length === 0) {\n      if (complaintShortAnswerMode && totalBytes > 0) {\n        console.info(\"[guest-audio-second-pass] complaint short answer below minimum\", {\n          totalBytes,\n          guestAudioMinBytes,\n        });\n      }\n      return;\n    }`;

  source = source.replace(anchor, patch);
  fs.writeFileSync(path, source);
}

if (!fs.readFileSync(path, "utf8").includes(marker)) {
  throw new Error("complaint short-answer patch verification failed");
}

console.log("Applied complaint short-answer raw-audio threshold");
