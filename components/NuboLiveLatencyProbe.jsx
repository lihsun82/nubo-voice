"use client";

import { useEffect } from "react";
import {
  installNuboLiveLatencyProbe,
  uninstallNuboLiveLatencyProbe,
} from "@/lib/nubo-live-latency";

export function NuboLiveLatencyProbe() {
  useEffect(() => {
    installNuboLiveLatencyProbe();
    return () => {
      uninstallNuboLiveLatencyProbe();
    };
  }, []);

  return null;
}
