"use client";

import { useEffect } from "react";

/**
 * Visual/performance hint only. Never treat a User-Agent as a trusted identity.
 * Native JJ1 app appends NUBO-JJ1/1 before loading the webpage.
 */
export function NuboJj1Profile() {
  useEffect(() => {
    if (!/\bNUBO-JJ1\/1\b/i.test(navigator.userAgent)) return;

    document.documentElement.dataset.nuboDevice = "jj1";
    window.dispatchEvent(new Event("nubo:jj1-ready"));
  }, []);

  return null;
}
