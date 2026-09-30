import type { Metadata } from "next";
import "./_styles/globals.css";
import "./_styles/workspace.css";
import "./_styles/memo-board.css";
import "./_styles/login.css";
import "./_styles/calendar.css";
import "./_styles/result.css";
import "./_styles/daily-activity-clock.css";

export const metadata: Metadata = {
  title: "업무 기록 · Work Timer",
  description: "일일 업무 일지와 작업 시간 측정",
  robots: { index: false, follow: false },
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
