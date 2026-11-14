import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AINUBO 新寶智慧酒店",
    short_name: "AINUBO",
    description: "AINUBO Hotel 旅客語音管家",
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
