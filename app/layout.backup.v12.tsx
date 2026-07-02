import type { Metadata } from "next";
import "./globals.css";
import "./task-center.css";
import "./integration-center.css";
import "./youtube-player.css";
import "./orb-theme.css";

export const metadata: Metadata = {
  title: "NUBO Voice",
  description: "NUBO personal voice automation system",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
