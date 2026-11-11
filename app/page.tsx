import type { Metadata } from "next";
import { cookies } from "next/headers";
import Workspace from "./_components/workspace";
import { COOKIE } from "@/server/auth/auth";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

// 세션 쿠키가 없는 방문자(검색 크롤러 포함)에게는 로그인 화면을 서버 HTML로 바로 내려준다.
export default async function Home() {
  const signedOut = !(await cookies()).has(COOKIE);
  return <Workspace signedOut={signedOut} />;
}
