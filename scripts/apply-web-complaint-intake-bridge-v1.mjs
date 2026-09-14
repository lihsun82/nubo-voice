import fs from "node:fs";

const marker = "NUBO_COMPLAINT_INTAKE_BRIDGE_V1";
const path = "lib/browser-audio.ts";
let source = fs.readFileSync(path, "utf8");

if (!source.includes(marker)) {
  const anchor = "        if (payload?.sent === true || payload?.duplicate === true) {";
  if (!source.includes(anchor)) {
    throw new Error("complaint intake bridge: browser-audio response anchor missing");
  }

  const bridge = `        // ${marker}: when raw-audio detects a complaint but the backend\n        // refuses to send because room/surname are missing, turn that result into\n        // a persistent multi-turn complaint intake instead of treating it as an error.\n        if (payload?.requiresComplaintIntake === true && typeof window !== \"undefined\") {\n          try {\n            const key = \"nubo_complaint_intake_v3\";\n            const raw = window.localStorage.getItem(key);\n            const parsed = raw ? JSON.parse(raw) as {\n              active?: boolean;\n              startedAt?: number;\n              updatedAt?: number;\n              surname?: string;\n              roomNumber?: string;\n              issueParts?: string[];\n            } : null;\n            const now = Date.now();\n            const issue = String(payload?.decision?.issue ?? \"\").trim();\n            const roomNumber = String(payload?.decision?.roomNumber ?? \"\").trim();\n            const issueParts = Array.isArray(parsed?.issueParts)\n              ? parsed!.issueParts!.filter((item) => typeof item === \"string\" && item.trim()).slice(-7)\n              : [];\n            if (issue && !issueParts.some((item) => item.trim() === issue)) issueParts.push(issue);\n\n            window.localStorage.setItem(key, JSON.stringify({\n              active: true,\n              startedAt: Number(parsed?.startedAt) || now,\n              updatedAt: now,\n              surname: String(parsed?.surname ?? \"\").trim(),\n              roomNumber: String(parsed?.roomNumber ?? \"\").trim() || roomNumber,\n              issueParts: issueParts.slice(-8),\n            }));\n            console.info(\"[complaint-intake-bridge] raw-audio handed off to three-field intake\", {\n              roomNumber: roomNumber || null,\n              missingFields: payload?.missingFields ?? [],\n            });\n          } catch (error) {\n            console.warn(\"[complaint-intake-bridge] failed to persist intake state\", error);\n          }\n          return;\n        }\n\n${anchor}`;

  source = source.replace(anchor, bridge);
  fs.writeFileSync(path, source);
}

console.log("Applied raw-audio -> complaint intake bridge v1");
