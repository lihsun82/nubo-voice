import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NUBO Voice",
  description: "NUBO personal voice automation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
