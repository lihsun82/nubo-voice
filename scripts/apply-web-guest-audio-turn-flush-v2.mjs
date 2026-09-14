import fs from "node:fs";

const marker = "NUBO_GUEST_AUDIO_TURN_FLUSH_V2";

const audioPath = "lib/browser-audio.ts";
let audio = fs.readFileSync(audioPath, "utf8");

if (!audio.includes("NUBO_GUEST_AUDIO_SECOND_PASS_V1")) {
  throw new Error("guest audio turn flush: second-pass patch must run first");
}

if (!audio.includes(marker)) {
  const privateAnchor = "  private flushGuestAudioSecondPass() {";
  if (!audio.includes(privateAnchor)) {
    throw new Error("guest audio turn flush: flush method anchor missing");
  }
  audio = audio.replace(
    privateAnchor,
    `  // ${marker}: Gemini turnComplete can force delivery even when local VAD never reaches silence.\n  flushGuestAudioSecondPass() {`,
  );
  fs.writeFileSync(audioPath, audio);
}

const voicePath = "components/GeminiVoiceConsole.tsx";
let voice = fs.readFileSync(voicePath, "utf8");

if (!voice.includes(marker)) {
  const anchor = "          const serverContent = message.serverContent;";
  const patch = `${anchor}\n\n          // ${marker}\n          // Mobile VAD can stay hot because of speaker echo / room noise. Gemini Live\n          // turnComplete is the authoritative end-of-turn signal, so always flush the\n          // buffered raw guest audio here as a second independent LINE-delivery path.\n          if (\n            serverContent?.turnComplete === true ||\n            serverContent?.turn_complete === true\n          ) {\n            microphoneRef.current?.flushGuestAudioSecondPass();\n          }`;
  if (!voice.includes(anchor)) {
    throw new Error("guest audio turn flush: serverContent anchor missing");
  }
  voice = voice.replace(anchor, patch);
  fs.writeFileSync(voicePath, voice);
}

console.log("Applied guest raw-audio turn-complete flush v2");
