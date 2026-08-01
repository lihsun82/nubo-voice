import type { NextConfig } from "next";

const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  {
    key: "X-NUBO-Build",
    value: "public-web-navigation-v6-20260801",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/",
        headers: noStoreHeaders,
      },
      {
        source: "/open",
        headers: noStoreHeaders,
      },
      {
        source: "/api/health",
        headers: noStoreHeaders,
      },
      {
        source: "/manifest.webmanifest",
        headers: noStoreHeaders,
      },
      {
        source: "/sw.js",
        headers: noStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
