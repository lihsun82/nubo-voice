import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NUBO 智能語音",
    short_name: "NUBO",
    description: "NUBO 個人 AI 語音與自動化控制中心",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#07090d",
    theme_color: "#0b0d14",
    orientation: "portrait",
    lang: "zh-Hant-TW",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/nubo-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/nubo-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
