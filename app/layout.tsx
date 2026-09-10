import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./login.css";
import "./calendar.css";

export const metadata: Metadata = {
  title: "업무 기록 · Work Timer",
  description: "일일 업무 일지와 작업 시간 측정",
  robots: { index: false, follow: false },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
