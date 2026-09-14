import fs from "node:fs";

const marker = "NUBO_COMPLAINT_AUDIO_AUTHORITATIVE_V1";

function patchAudioRoute() {
  const path = "app/api/notify/guest-service-audio/route.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  source = source.replace(
    `type AudioDecision = {\n  guestService: boolean;\n  confidence: number;\n  roomNumber: string;\n  issue: string;\n  urgency: "normal" | "high" | "critical";\n};`,
    `type AudioDecision = {\n  guestService: boolean;\n  complaint: boolean;\n  confidence: number;\n  roomNumber: string;\n  surname: string;\n  issue: string;\n  urgency: "normal" | "high" | "critical";\n};\n\ntype ComplaintIntakeSnapshot = {\n  active: boolean;\n  roomNumber: string;\n  surname: string;\n  issueParts: string[];\n};`,
  );

  const cleanAnchor = `function clean(value: unknown) {\n  return String(value ?? "").trim();\n}`;
  const cleanPatch = `${cleanAnchor}\n\n// ${marker}\nfunction parseComplaintIntake(value: unknown): ComplaintIntakeSnapshot {\n  if (!value || typeof value !== "object") {\n    return { active: false, roomNumber: "", surname: "", issueParts: [] };\n  }\n  const raw = value as Record<string, unknown>;\n  return {\n    active: raw.active === true,\n    roomNumber: clean(raw.roomNumber),\n    surname: clean(raw.surname),\n    issueParts: Array.isArray(raw.issueParts)\n      ? raw.issueParts.map(clean).filter(Boolean).slice(-8)\n      : [],\n  };\n}\n\nfunction isComplaintMetadataOnly(value: string, roomNumber: string, surname: string) {\n  const normalized = value.replace(/[\\s　，,。.!！?？、:：;；'\"“”‘’（）()【】\\[\\]-]+/g, "");\n  if (!normalized) return true;\n  if (roomNumber && normalized === roomNumber.replace(/\\s/g, "")) return true;\n  if (surname && normalized === surname.replace(/\\s/g, "")) return true;\n  if (/^(?:房號|房間|住在|住)?[A-Za-z]?\\d{2,4}(?:號?房)?$/iu.test(normalized)) return true;\n  if (/^(?:我姓|姓氏(?:是|為)?|姓)?[\\p{Script=Han}]{1,2}$/u.test(normalized)) return true;\n  return false;\n}\n\nfunction mergeComplaintIssue(parts: string[], issue: string, roomNumber: string, surname: string) {\n  const next = parts.slice(-7);\n  const cleaned = clean(issue);\n  if (!cleaned || isComplaintMetadataOnly(cleaned, roomNumber, surname)) return next;\n  if (!next.some((item) => item === cleaned)) next.push(cleaned);\n  return next.slice(-8);\n}`;
  if (!source.includes(cleanAnchor)) throw new Error("complaint audio authoritative: clean anchor missing");
  source = source.replace(cleanAnchor, cleanPatch);

  source = source.replace(
    `      guestService: payload?.guestService === true,\n      confidence: clampConfidence(payload?.confidence),\n      roomNumber: clean(payload?.roomNumber),\n      issue: clean(payload?.issue),\n      urgency,`,
    `      guestService: payload?.guestService === true,\n      complaint: payload?.complaint === true,\n      confidence: clampConfidence(payload?.confidence),\n      roomNumber: clean(payload?.roomNumber),\n      surname: clean(payload?.surname),\n      issue: clean(payload?.issue),\n      urgency,`,
  );

  source = source.replace(
    `    "只要語意明確是旅館客務，即使品項有一兩個字聽不清楚，也 guestService=true，issue 可寫『旅客要求送物到房間，品項語音不確定，請現場確認』，不要因此漏報。",`,
    `    "只要語意明確是旅館客務，即使品項有一兩個字聽不清楚，也 guestService=true，issue 可寫『旅客要求送物到房間，品項語音不確定，請現場確認』，不要因此漏報。",\n    "若旅客是在客訴／投訴／抱怨流程，complaint=true。每一小段音訊都要盡量抽取：房號 roomNumber、姓氏 surname、以及真正的客訴內容 issue。只回答『305』『三零五』時 roomNumber=305 且 issue 留空；只回答『李』『我姓李』時 surname=李 且 issue 留空。",\n    "若音訊只是前一個客訴流程中的欄位回答，即使 guestService=false，也仍要正確輸出 complaint=false 但 roomNumber/surname 可填；伺服器會依既有客訴狀態合併。",`,
  );

  source = source.replace(
    `    '{"guestService":true,"confidence":0.0,"roomNumber":"","issue":"","urgency":"normal"}',`,
    `    '{"guestService":true,"complaint":false,"confidence":0.0,"roomNumber":"","surname":"","issue":"","urgency":"normal"}',`,
  );

  const bodyAnchor = `    const body = await req.json().catch(() => ({}));\n    const pcmBase64 = clean(body.pcmBase64);`;
  const bodyPatch = `    const body = await req.json().catch(() => ({}));\n    const complaintIntake = parseComplaintIntake(body.complaintIntake);\n    const pcmBase64 = clean(body.pcmBase64);`;
  if (!source.includes(bodyAnchor)) throw new Error("complaint audio authoritative: body anchor missing");
  source = source.replace(bodyAnchor, bodyPatch);

  source = source.replace(
    `      roomNumber: decision.roomNumber || null,\n      urgency: decision.urgency,`,
    `      roomNumber: decision.roomNumber || null,\n      surname: decision.surname || null,\n      complaint: decision.complaint,\n      urgency: decision.urgency,`,
  );

  const decisionAnchor = `    if (!decision.guestService || decision.confidence < 0.55) {\n      return NextResponse.json({\n        ok: true,\n        analyzed: true,\n        sent: false,\n        decision,\n        model,\n      });\n    }\n\n    const issue = decision.issue || "旅客提出需要現場人員處理的客務需求，請現場確認。";\n    const port = clean(process.env.PORT) || "10000";\n    const forwardUrl = \`http://127.0.0.1:\${port}/api/notify/guest-service\`;`;
  const decisionPatch = `    const port = clean(process.env.PORT) || "10000";\n    const forwardUrl = \`http://127.0.0.1:\${port}/api/notify/guest-service\`;\n\n    const complaintMode = complaintIntake.active || decision.complaint;\n    if (complaintMode) {\n      const roomNumber = complaintIntake.roomNumber || decision.roomNumber;\n      const surname = complaintIntake.surname || decision.surname;\n      const issueParts = mergeComplaintIssue(\n        complaintIntake.issueParts,\n        decision.issue,\n        roomNumber,\n        surname,\n      );\n      const issue = issueParts.join("；").trim();\n      const updatedIntake: ComplaintIntakeSnapshot = {\n        active: true,\n        roomNumber,\n        surname,\n        issueParts,\n      };\n      const missingFields = [\n        !roomNumber ? "房號" : "",\n        !surname ? "姓氏" : "",\n        !issue ? "客訴內容" : "",\n      ].filter(Boolean);\n\n      if (missingFields.length > 0) {\n        console.info("[guest-service-audio] complaint intake accumulating", {\n          roomNumber: roomNumber || null,\n          surname: surname || null,\n          missingFields,\n        });\n        return NextResponse.json({\n          ok: true,\n          analyzed: true,\n          sent: false,\n          complaint: true,\n          requiresComplaintIntake: true,\n          missingFields,\n          complaintIntake: updatedIntake,\n          decision,\n          model,\n        });\n      }\n\n      const forwarded = await fetchWithTransientRetry(\n        forwardUrl,\n        {\n          method: "POST",\n          headers: { "Content-Type": "application/json" },\n          body: JSON.stringify({\n            complaint: true,\n            roomNumber,\n            surname,\n            issue,\n            source: "raw-audio-complaint-intake-authoritative-v1",\n          }),\n        },\n        70_000,\n        2,\n      );\n      const forwardedPayload = await forwarded.json().catch(() => ({}));\n      if (!forwarded.ok) {\n        throw new Error(\n          forwardedPayload?.error ?? \`客訴通知轉送失敗：\${forwarded.status}\`,\n        );\n      }\n\n      console.info("[guest-service-audio] complaint delivered", {\n        roomNumber,\n        surname,\n        model,\n      });\n      return NextResponse.json({\n        ok: true,\n        analyzed: true,\n        sent: forwardedPayload?.sent === true,\n        duplicate: forwardedPayload?.duplicate === true,\n        complaint: true,\n        complaintIntake: updatedIntake,\n        decision,\n        model,\n      });\n    }\n\n    if (!decision.guestService || decision.confidence < 0.55) {\n      return NextResponse.json({\n        ok: true,\n        analyzed: true,\n        sent: false,\n        decision,\n        model,\n      });\n    }\n\n    const issue = decision.issue || "旅客提出需要現場人員處理的客務需求，請現場確認。";`;
  if (!source.includes(decisionAnchor)) throw new Error("complaint audio authoritative: decision anchor missing");
  source = source.replace(decisionAnchor, decisionPatch);

  fs.writeFileSync(path, source);
}

function patchBrowserAudio() {
  const path = "lib/browser-audio.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const lockPattern = /    \/\/ NUBO_COMPLAINT_SESSION_LOCK_V2:[\s\S]*?\n\n    if \(totalBytes < NUBO_GUEST_AUDIO_MIN_BYTES \|\| chunks\.length === 0\) return;/;
  if (!lockPattern.test(source)) throw new Error("complaint audio authoritative: complaint lock block missing");
  source = source.replace(lockPattern, `    // ${marker}: while complaint intake is active, raw audio stays enabled as\n    // the authoritative field collector. It must not be suppressed.\n    let complaintIntakeSnapshot: {\n      active: boolean;\n      roomNumber: string;\n      surname: string;\n      issueParts: string[];\n    } | null = null;\n    if (typeof window !== "undefined") {\n      try {\n        const raw = window.localStorage.getItem("nubo_complaint_intake_v3");\n        const state = raw ? (JSON.parse(raw) as {\n          active?: boolean;\n          roomNumber?: string;\n          surname?: string;\n          issueParts?: string[];\n        }) : null;\n        if (state?.active) {\n          complaintIntakeSnapshot = {\n            active: true,\n            roomNumber: String(state.roomNumber ?? "").trim(),\n            surname: String(state.surname ?? "").trim(),\n            issueParts: Array.isArray(state.issueParts)\n              ? state.issueParts.filter((item) => typeof item === "string").slice(-8)\n              : [],\n          };\n        }\n      } catch {\n        // Ignore malformed local state; normal audio analysis may continue.\n      }\n    }\n\n    if (totalBytes < NUBO_GUEST_AUDIO_MIN_BYTES || chunks.length === 0) return;`);

  const sourceAnchor = `        source: "browser-mic-raw-second-pass-v1",`;
  if (!source.includes(sourceAnchor)) throw new Error("complaint audio authoritative: request body anchor missing");
  source = source.replace(sourceAnchor, `${sourceAnchor}\n        complaintIntake: complaintIntakeSnapshot,`);

  const bridgeAnchor = `        if (payload?.requiresComplaintIntake === true && typeof window !== "undefined") {`;
  if (!source.includes(bridgeAnchor)) throw new Error("complaint audio authoritative: intake bridge anchor missing");
  source = source.replace(
    `            const issue = String(payload?.decision?.issue ?? "").trim();\n            const roomNumber = String(payload?.decision?.roomNumber ?? "").trim();`,
    `            const returned = payload?.complaintIntake && typeof payload.complaintIntake === "object"\n              ? payload.complaintIntake as { roomNumber?: string; surname?: string; issueParts?: string[] }\n              : null;\n            const issue = String(payload?.decision?.issue ?? "").trim();\n            const roomNumber = String(returned?.roomNumber ?? payload?.decision?.roomNumber ?? "").trim();\n            const surname = String(returned?.surname ?? parsed?.surname ?? "").trim();`,
  );
  source = source.replace(
    `              surname: String(parsed?.surname ?? "").trim(),\n              roomNumber: String(parsed?.roomNumber ?? "").trim() || roomNumber,\n              issueParts: issueParts.slice(-8),`,
    `              surname,\n              roomNumber: String(parsed?.roomNumber ?? "").trim() || roomNumber,\n              issueParts: Array.isArray(returned?.issueParts)\n                ? returned!.issueParts!.filter((item) => typeof item === "string" && item.trim()).slice(-8)\n                : issueParts.slice(-8),`,
  );

  const sentAnchor = `        if (payload?.sent === true || payload?.duplicate === true) {`;
  if (!source.includes(sentAnchor)) throw new Error("complaint audio authoritative: sent anchor missing");
  const sentPatch = `        if (payload?.complaint === true && (payload?.sent === true || payload?.duplicate === true) && typeof window !== "undefined") {\n          try {\n            window.localStorage.removeItem("nubo_complaint_intake_v3");\n            window.localStorage.setItem("nubo_complaint_last_sent_v3", JSON.stringify({\n              fingerprint: "raw-audio-authoritative",\n              at: Date.now(),\n            }));\n          } catch {\n            // Best effort local cleanup only.\n          }\n        }\n\n${sentAnchor}`;
  source = source.replace(sentAnchor, sentPatch);

  fs.writeFileSync(path, source);
}

patchAudioRoute();
patchBrowserAudio();
console.log("Applied authoritative raw-audio complaint intake v1");
