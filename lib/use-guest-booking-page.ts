"use client";

import { useEffect, useState } from "react";
import { tryNativeAndroidLaunch } from "../lib/mobile-direct-app-v4";
import { GUEST_KIOSK_URL, GuestBookingHandoff } from "./nubo-booking-handoff";

export function useGuestBookingPage() {
  const [link, setLink] = useState({ url: GUEST_KIOSK_URL, blocked: false });
  const [handoff] = useState(() => new GuestBookingHandoff(url => {
    if (document.hidden) return false;
    if (tryNativeAndroidLaunch(url, "網站")) return true;
    try {
      const tab = window.open(url, "nubo_guest_booking");
      if (!tab) return false;
      tab.opener = null;
      tab.focus();
      return true;
    } catch { return false; }
  }, (url, blocked) => setLink({ url, blocked })));
  useEffect(() => {
    const state = (event: Event) => handoff.playback((event as CustomEvent).detail?.active === true);
    window.addEventListener("nubo:audio-playback-state", state);
    return () => { window.removeEventListener("nubo:audio-playback-state", state); handoff.reset(); };
  }, [handoff]);
  return { link, handoff, resetLink: () => setLink({ url: GUEST_KIOSK_URL, blocked: false }) };
}

export async function loadGuestBookingLink() {
  try {
    const response = await fetch("/api/guest-booking-link", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.enabled !== true || typeof data.url !== "string") return null;
    const url = new URL(data.url);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
