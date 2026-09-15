import fs from "node:fs";

const marker = "NUBO_COMPLAINT_STATE_ISOLATION_V1";

function patchAudioRoute() {
  const path = "app/api/notify/guest-service-audio/route.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const complaintModeAnchor = `    const complaintMode = complaintIntake.active || decision.complaint;`;
  const complaintModePatch = `    // ${marker}: a stale complaint intake must never capture a new explicit\n    // non-complaint amenity request. Example: an old 111 complaint followed by\n    // \"send two bottles of water to room 800\" must remain room 800 and no surname.\n    const explicitAmenityRequest =\n      decision.guestService &&\n      !decision.complaint &&\n      decision.confidence >= 0.8 &&\n      Boolean(decision.roomNumber) &&\n      /(?:毛巾|浴巾|礦泉水|矿泉水|瓶水|飲用水|饮用水|牙刷|牙膏|拖鞋|衛生紙|卫生纸|備品|备品|枕頭|枕头|棉被|吹風機|吹风机|衣架|充電器|充电器|轉接頭|转接头)/u.test(decision.issue);\n    const clearComplaintIntake = complaintIntake.active && explicitAmenityRequest;\n    const complaintMode = !clearComplaintIntake && (complaintIntake.active || decision.complaint);\n    if (clearComplaintIntake) {\n      console.info(\"[guest-service-audio] stale complaint intake cleared by explicit amenity request\", {\n        oldRoomNumber: complaintIntake.roomNumber || null,\n        newRoomNumber: decision.roomNumber || null,\n      });\n    }`;
  if (!source.includes(complaintModeAnchor)) {
    throw new Error("complaint state isolation: complaint mode anchor missing");
  }
  source = source.replace(complaintModeAnchor, complaintModePatch);

  const normalReturnAnchor = `      duplicate: forwardedPayload?.duplicate === true,\n      decision,\n      model,`;
  const normalReturnPatch = `      duplicate: forwardedPayload?.duplicate === true,\n      clearComplaintIntake,\n      decision,\n      model,`;
  const normalReturnIndex = source.lastIndexOf(normalReturnAnchor);
  if (normalReturnIndex < 0) {
    throw new Error("complaint state isolation: normal return anchor missing");
  }
  source =
    source.slice(0, normalReturnIndex) +
    source.slice(normalReturnIndex).replace(normalReturnAnchor, normalReturnPatch);

  fs.writeFileSync(path, source);
}

function patchBrowserAudio() {
  const path = "lib/browser-audio.ts";
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;

  const staleAnchor = `        if (state?.active) {\n          complaintIntakeSnapshot = {\n            active: true,\n            roomNumber: String(state.roomNumber ?? \"\").trim(),\n            surname: String(state.surname ?? \"\").trim(),\n            issueParts: Array.isArray(state.issueParts)\n              ? state.issueParts.filter((item) => typeof item === \"string\").slice(-8)\n              : [],\n          };\n        }`;
  const stalePatch = `        // ${marker}: expire abandoned complaint intake so it cannot leak\n        // room/surname into a later unrelated amenity request.\n        const stateUpdatedAt = Number((state as any)?.updatedAt ?? (state as any)?.startedAt ?? 0);\n        const stateExpired = !stateUpdatedAt || Date.now() - stateUpdatedAt > 5 * 60_000;\n        if (state?.active && stateExpired) {\n          window.localStorage.removeItem(\"nubo_complaint_intake_v3\");\n          console.info(\"[complaint-intake] expired stale state before audio analysis\");\n        } else if (state?.active) {\n          complaintIntakeSnapshot = {\n            active: true,\n            roomNumber: String(state.roomNumber ?? \"\").trim(),\n            surname: String(state.surname ?? \"\").trim(),\n            issueParts: Array.isArray(state.issueParts)\n              ? state.issueParts.filter((item) => typeof item === \"string\").slice(-8)\n              : [],\n          };\n        }`;
  if (!source.includes(staleAnchor)) {
    throw new Error("complaint state isolation: browser snapshot anchor missing");
  }
  source = source.replace(staleAnchor, stalePatch);

  const responseAnchor = `        if (payload?.requiresComplaintIntake === true && typeof window !== \"undefined\") {`;
  const responsePatch = `        if (payload?.clearComplaintIntake === true && typeof window !== \"undefined\") {\n          try {\n            window.localStorage.removeItem(\"nubo_complaint_intake_v3\");\n            console.info(\"[complaint-intake] cleared stale state after explicit new amenity request\");\n          } catch {}\n        }\n\n${responseAnchor}`;
  if (!source.includes(responseAnchor)) {
    throw new Error("complaint state isolation: browser response anchor missing");
  }
  source = source.replace(responseAnchor, responsePatch);

  fs.writeFileSync(path, source);
}

patchAudioRoute();
patchBrowserAudio();
console.log("Applied stale complaint state isolation from new amenity requests");
