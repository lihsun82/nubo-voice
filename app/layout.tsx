import type { Metadata, Viewport } from "next";
import { NuboDirectOpenGuard } from "@/components/NuboDirectOpenGuard";
import { NuboPublicBrandingGuard } from "@/components/NuboPublicBrandingGuard";
import { NuboSpaceBackground } from "@/components/NuboSpaceBackground";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import "./globals.css";
import "./task-center.css";
import "./integration-center.css";
import "./youtube-player.css";
import "./orb-theme.css";
import "./mobile-pwa.css";
import "./mobile-privacy-v11.css";
import "./inline-music-v13.css";
import "./inline-music-quality-v14-6.css";
import "./voice-modes-v15.css";
import "./space-v15-5.css";
import "./voice-quick-v15-5-1.css";
import "./white-tech-v15-6-17.css";
import "./white-gold-v15-6-18.css";
import "./molecular-orb-v15-6-26.css";

export const metadata: Metadata = {
  title: {
    default: "NUBO 智能語音",
    template: "%s | NUBO",
  },
  description: "AINUBO Hotel 智慧旅館管家與自動化控制中心",
  applicationName: "NUBO",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NUBO",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/nubo-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/nubo-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <NuboSpaceBackground />
        <NuboDirectOpenGuard />
        <NuboPublicBrandingGuard />
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
