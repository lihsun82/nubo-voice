"use client";

import {
  forceDirectMobileOpen as legacyForceDirectMobileOpen,
  resolveWebsiteMobileResult,
} from "./mobile-direct-app-v4";
import { launchYouTubeStableV48 } from "./youtube-stable-launch-v48";

export { resolveWebsiteMobileResult };

function readTargetUrl(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const payload = result as Record<string, unknown>;
  for (const key of ["mobileUrl", "url", "playerUrl"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readQuery(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const payload = result as Record<string, unknown>;
  for (const key of ["query", "title"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isYouTubeTarget(url: string) {
  const value = url.toLowerCase();
  return value.includes("youtube.com") || value.includes("youtu.be");
}

export function forceDirectMobileOpen(result: unknown, callName: string) {
  const targetUrl = readTargetUrl(result);
  const youtube = callName === "open_youtube" || isYouTubeTarget(targetUrl);

  if (!youtube) {
    // Critical scope guard: every non-YouTube app keeps the current implementation.
    return legacyForceDirectMobileOpen(result, callName);
  }

  const targetOrQuery = targetUrl || readQuery(result);
  const launch = launchYouTubeStableV48(targetOrQuery);

  return {
    ...(result && typeof result === "object" ? (result as Record<string, unknown>) : {}),
    ...launch,
    autoOpen: false,
    preserveNubo: true,
    stableSource: "stable-2026-08-01-before-phone-agent-v2-bridge-fix",
    build: "youtube-stable-launch-v48-20260815",
  };
}
