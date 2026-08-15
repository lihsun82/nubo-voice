"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const IntegrationCenter = dynamic(
  () =>
    import("@/components/IntegrationCenter").then(
      (module) => module.IntegrationCenter,
    ),
  { ssr: false },
);

export function DeferredDashboardCenters() {
  const markerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    const mobile = window.matchMedia(
      "(pointer: coarse) and (max-width: 1100px)",
    ).matches;
    const marker = markerRef.current;
    let observer: IntersectionObserver | null = null;

    const load = () => setReady(true);

    if (marker && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            load();
            observer?.disconnect();
          }
        },
        {
          rootMargin: mobile ? "320px" : "700px",
        },
      );
      observer.observe(marker);
    }

    const fallbackTimer = window.setTimeout(
      load,
      mobile ? 12_000 : 2_500,
    );

    return () => {
      observer?.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, [ready]);

  if (!ready) {
    return (
      <div
        ref={markerRef}
        className="deferred-dashboard-placeholder"
        aria-live="polite"
      >
        其他工作中心將在語音服務完成啟動後載入。
      </div>
    );
  }

  return <IntegrationCenter />;
}
