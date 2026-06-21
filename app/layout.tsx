import type { Metadata } from "next";
import "./globals.css";
import "./task-center.css";

export const metadata: Metadata = {
  title: "NUBO Voice",
  description: "NUBO 個人即時語音總管與任務中心",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
