import fs from "node:fs";

const marker = "NUBO_GUEST_VOICE_ECHO_GUARD_V1";

function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) {
    throw new Error(`guest voice echo guard: ${label} anchor missing`);
  }
  return source.replace(anchor, replacement);
}

function patchBrowserAudio() {
  const path = "lib/browser-audio.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  if (!source.includes("NUBO_GUEST_AUDIO_SECOND_PASS_V1")) {
    throw new Error("guest voice echo guard: raw guest audio second pass must run first");
  }

  // Web Sense already hooks dispatchPlaybackState before this patch runs. Compose
  // with that hook instead of replacing the complete function.
  const playbackAnchor = `function dispatchPlaybackState(active: boolean) {\n  webSensePlaybackActive = active;\n  if (active) resetWebSenseBuffer();\n  if (typeof window === "undefined") return;`;
  const playbackPatch = `// ${marker}\n// NUBO is intentionally half-duplex around assistant speech. Mobile WebView AEC can\n// leave enough speaker echo for both Gemini Live and the independent raw-audio guest\n// detector to hear NUBO's own reply as if it were a new guest request.\nconst NUBO_ASSISTANT_ECHO_TAIL_MS = 1_000;\nlet nuboAssistantPlaybackActive = false;\nlet nuboAssistantCaptureGuardUntil = 0;\n\nfunction isNuboAssistantCaptureBlocked(now = Date.now()) {\n  return nuboAssistantPlaybackActive || now < nuboAssistantCaptureGuardUntil;\n}\n\nfunction dispatchPlaybackState(active: boolean) {\n  webSensePlaybackActive = active;\n  if (active) resetWebSenseBuffer();\n\n  nuboAssistantPlaybackActive = active;\n  if (!active) {\n    nuboAssistantCaptureGuardUntil = Math.max(\n      nuboAssistantCaptureGuardUntil,\n      Date.now() + NUBO_ASSISTANT_ECHO_TAIL_MS,\n    );\n  } else {\n    nuboAssistantCaptureGuardUntil = 0;\n  }\n\n  if (typeof window === "undefined") return;`;
  source = replaceOnce(source, playbackAnchor, playbackPatch, "playback state");

  const analysisFieldAnchor = `  private guestAudioLastVoiceAt = 0;`;
  const analysisFieldPatch = `${analysisFieldAnchor}\n  private guestAudioAnalysisInFlight = false;`;
  source = replaceOnce(source, analysisFieldAnchor, analysisFieldPatch, "analysis field");

  // Mobile Pure PCM moves all microphone processing into handlePcmInput(), so gate
  // capture there before PCM reaches either Gemini Live or the raw guest detector.
  const processAnchor = `    const threshold = Math.max(0.02, this.noiseFloor * 2.6);\n    const now = Date.now();`;
  const processPatch = `${processAnchor}\n\n    // Never forward assistant playback/echo back into Gemini Live or the guest-alert\n    // second pass. Reset VAD and all guest buffers so an assistant sentence cannot\n    // survive until turnComplete and become a phantom LINE notification.\n    if (isNuboAssistantCaptureBlocked(now)) {\n      this.hotFrames = 0;\n      this.lastVoiceAt = now;\n      this.preRoll = [];\n      this.guestAudioPreRoll = [];\n      this.guestAudioChunks = [];\n      this.guestAudioBytes = 0;\n      this.guestAudioActive = false;\n      this.guestAudioLastVoiceAt = 0;\n      resetNativeSenseBuffer();\n      resetWebSenseBuffer();\n      return;\n    }`;
  source = replaceOnce(source, processAnchor, processPatch, "microphone playback gate");

  const flushAnchor = `  flushGuestAudioSecondPass() {`;
  const flushPatch = `${flushAnchor}\n    // turnComplete may fire while NUBO is still speaking. Discard that buffer rather\n    // than analyzing it, and serialize raw-audio analyses so one utterance cannot fan\n    // out into several LINE sends.\n    if (isNuboAssistantCaptureBlocked() || this.guestAudioAnalysisInFlight) {\n      this.guestAudioChunks = [];\n      this.guestAudioBytes = 0;\n      this.guestAudioActive = false;\n      this.guestAudioLastVoiceAt = 0;\n      this.guestAudioPreRoll = [];\n      return;\n    }`;
  source = replaceOnce(source, flushAnchor, flushPatch, "raw-audio flush");

  const shortAnswerAnchor = `    const guestAudioMinBytes = complaintShortAnswerMode ? 3_200 : NUBO_GUEST_AUDIO_MIN_BYTES;`;
  const shortAnswerPatch = `    // One Chinese surname is short, but 0.1s accepts clicks, speaker tails and room\n    // noise. 0.25s remains short enough for 李/林/陳 while rejecting most transients.\n    const guestAudioMinBytes = complaintShortAnswerMode ? 8_000 : NUBO_GUEST_AUDIO_MIN_BYTES;`;
  source = replaceOnce(source, shortAnswerAnchor, shortAnswerPatch, "complaint short answer threshold");

  const fetchAnchor = `    void fetch("/api/notify/guest-service-audio", {`;
  const fetchPatch = `    this.guestAudioAnalysisInFlight = true;\n    void fetch("/api/notify/guest-service-audio", {`;
  source = replaceOnce(source, fetchAnchor, fetchPatch, "raw-audio fetch lock");

  const catchAnchor = `      .catch((error) => {\n        console.warn("[guest-audio-second-pass] analysis failed", error);\n      });`;
  const catchPatch = `      .catch((error) => {\n        console.warn("[guest-audio-second-pass] analysis failed", error);\n      })\n      .finally(() => {\n        this.guestAudioAnalysisInFlight = false;\n      });`;
  source = replaceOnce(source, catchAnchor, catchPatch, "raw-audio fetch unlock");

  fs.writeFileSync(path, source);
}

function patchGuestAudioRoute() {
  const path = "app/api/notify/guest-service-audio/route.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  if (!source.includes("NUBO_COMPLAINT_STATE_ISOLATION_V1")) {
    throw new Error("guest voice echo guard: complaint state isolation must run first");
  }

  const permissivePrompt = `    "只要語意明確是旅館客務，即使品項有一兩個字聽不清楚，也 guestService=true，issue 可寫『旅客要求送物到房間，品項語音不確定，請現場確認』，不要因此漏報。",`;
  const strictPrompt = `    // ${marker}\n    "非客訴的一般客務只有在『旅客本人』的需求、房號與要處理的品項/問題都清楚可辨時才 guestService=true；任何關鍵字不確定就不要猜。",\n    "絕對不要把 NUBO 自己播放的語音、喇叭回音、背景電視、人員交談、提示音或殘缺音節當成旅客需求。若懷疑是回音或背景聲，guestService=false、issue 留空。",\n    "禁止產生『品項語音不確定，請現場確認』之類的推測性需求；房號或品項不確定時寧可不送，交由主對話再詢問。",`;
  source = replaceOnce(source, permissivePrompt, strictPrompt, "strict raw-audio prompt");

  const complaintModeAnchor = `    const complaintMode = !clearComplaintIntake && (complaintIntake.active || decision.complaint);`;
  const complaintModePatch = `    // Raw audio may continue an already-active complaint, but it may start a new\n    // complaint only with high confidence and explicit complaint content. This blocks\n    // a short echo/noise fragment from inventing a surname + room + complaint session.\n    const confidentNewComplaint =\n      !complaintIntake.active &&\n      decision.complaint &&\n      decision.guestService &&\n      decision.confidence >= 0.86 &&\n      Boolean(decision.issue) &&\n      !/(?:品項語音不確定|品項不確定|請現場確認|旅客提出需要現場人員處理)/u.test(decision.issue);\n    const complaintMode =\n      !clearComplaintIntake && (complaintIntake.active || confidentNewComplaint);`;
  source = replaceOnce(source, complaintModeAnchor, complaintModePatch, "new complaint confidence gate");

  const thresholdAnchor = `    if (!decision.guestService || decision.confidence < 0.55) {`;
  const thresholdPatch = `    if (!decision.guestService || decision.confidence < 0.82) {`;
  source = replaceOnce(source, thresholdAnchor, thresholdPatch, "raw guest-service confidence");

  const issueAnchor = `    const issue = decision.issue || "旅客提出需要現場人員處理的客務需求，請現場確認。";`;
  const issuePatch = `    const issue = clean(decision.issue);\n    const rawIssueUncertain =\n      !issue ||\n      /(?:品項語音不確定|品項不確定|請現場確認|旅客提出需要現場人員處理)/u.test(issue);\n\n    // Independent raw audio is a safety net, not an authority to invent missing\n    // details. For non-critical work we require an actionable room number as well.\n    if (rawIssueUncertain || (!decision.roomNumber && decision.urgency !== "critical")) {\n      return NextResponse.json({\n        ok: true,\n        analyzed: true,\n        sent: false,\n        reason: rawIssueUncertain ? "raw-audio-uncertain" : "raw-audio-room-missing",\n        decision,\n        model,\n      });\n    }`;
  source = replaceOnce(source, issueAnchor, issuePatch, "uncertain raw issue gate");

  fs.writeFileSync(path, source);
}

function patchGuestServiceRoute() {
  const path = "app/api/notify/guest-service/route.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  if (!source.includes("NUBO_AMENITY_SEMANTIC_DEDUPE_V1")) {
    throw new Error("guest voice echo guard: amenity semantic dedupe must run first");
  }

  const complaintFingerprintAnchor = `      ? [roomNumber || "unknown-room", "complaint", surname || "unknown-surname"]`;
  const complaintFingerprintPatch = `      // ${marker}: a complaint room is one incident for the duplicate window.\n      // Hallucinated alternate surnames must not create multiple staff alerts.\n      ? [roomNumber || "unknown-room", "complaint"]`;
  source = replaceOnce(
    source,
    complaintFingerprintAnchor,
    complaintFingerprintPatch,
    "complaint room-level dedupe",
  );

  fs.writeFileSync(path, source);
}

function patchBrowserToolDelivery() {
  const path = "lib/browser-nubo-tools-line.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const anchor = `  if (!response.ok) {\n    throw new Error(payload.error ?? "客務通知寄送失敗");\n  }\n  return payload;\n}`;
  const patch = `  if (!response.ok) {\n    throw new Error(payload.error ?? "客務通知寄送失敗");\n  }\n\n  // ${marker}: a successful explicit normal request is authoritative evidence that\n  // any unfinished complaint collector belongs to an older turn. Clear it immediately\n  // so raw audio cannot reuse an old room/surname seconds later.\n  if (\n    typeof window !== "undefined" &&\n    payload?.complaint !== true &&\n    (payload?.sent === true || payload?.duplicate === true)\n  ) {\n    try {\n      window.localStorage.removeItem("nubo_complaint_intake_v3");\n    } catch {\n      // Best-effort state cleanup only.\n    }\n  }\n\n  return payload;\n}`;
  source = replaceOnce(source, anchor, patch, "normal delivery stale-state cleanup");

  fs.writeFileSync(path, source);
}

function patchTranscriptIntake() {
  const path = "lib/nubo-guest-service-auto-intake.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  source = replaceOnce(
    source,
    `const INTAKE_TTL_MS = 20 * 60_000;`,
    `// ${marker}: abandoned complaint context must expire quickly in a shared hotel device.\nconst INTAKE_TTL_MS = 5 * 60_000;`,
    "complaint intake TTL",
  );

  const stateAnchor = `  const classification = classifyNuboGuestServiceTranscript(text);\n  const state = loadState();\n  const isComplaint =\n    classification.matched && classification.category === "complaint";`;
  const statePatch = `${stateAnchor}\n\n  // A complete new amenity-delivery sentence with its own room number is a new turn.\n  // Do not let an abandoned complaint collector absorb it. Keep this deliberately\n  // narrow so genuine complaint details such as \"冷氣壞掉\" remain in the complaint.\n  const explicitNewAmenityRoom = extractRoom(text, true);\n  const explicitNewAmenityRequest =\n    state.active &&\n    classification.matched &&\n    classification.category === "amenity" &&\n    Boolean(explicitNewAmenityRoom) &&\n    /(?:送|拿|補|給|需要|要).{0,24}(?:毛巾|浴巾|衛生紙|牙刷|牙膏|拖鞋|礦泉水|瓶水|飲用水|枕頭|棉被|吹風機|衣架|備品|充電器|轉接頭)/u.test(text);\n\n  if (explicitNewAmenityRequest) {\n    cancelPendingSend();\n    clearState();\n    return;\n  }`;
  source = replaceOnce(source, stateAnchor, statePatch, "new amenity state override");

  fs.writeFileSync(path, source);
}

patchBrowserAudio();
patchGuestAudioRoute();
patchGuestServiceRoute();
patchBrowserToolDelivery();
patchTranscriptIntake();

for (const path of [
  "lib/browser-audio.ts",
  "app/api/notify/guest-service-audio/route.ts",
  "app/api/notify/guest-service/route.ts",
  "lib/browser-nubo-tools-line.ts",
  "lib/nubo-guest-service-auto-intake.ts",
]) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(marker)) {
    throw new Error(`guest voice echo guard verification failed: ${path}`);
  }
}

console.log("Applied NUBO guest voice echo/stale-state guard v1");
