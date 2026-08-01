import type { Metadata, Viewport } from "next";
import { NuboGeminiLiveTuner } from "@/components/NuboGeminiLiveTuner";
import { NuboMobileActionBridge } from "@/components/NuboMobileActionBridge";
import { NuboPhoneAgentV2Bridge } from "@/components/NuboPhoneAgentV2Bridge";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import "./globals.css";
import "./task-center.css";
import "./integration-center.css";
import "./youtube-player.css";
import "./orb-theme.css";
import "./mobile-pwa.css";
import "./phone-agent-v2.css";

export const metadata: Metadata = {
  title: {
    default: "NUBO 智能語音",
    template: "%s | NUBO",
  },
  description: "NUBO 個人 AI 語音與自動化控制中心",
  applicationName: "NUBO",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
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
  themeColor: "#0b0d14",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <NuboMobileActionBridge />
        <NuboPhoneAgentV2Bridge />
        <NuboGeminiLiveTuner />
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
