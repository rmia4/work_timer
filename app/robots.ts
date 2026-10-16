import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/oauth";

// 검색 노출은 공개 페이지(개인정보처리방침·이용약관)만 허용한다. 나머지는 로그인 뒤 화면이라 루트 레이아웃에서 noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/privacy", "/terms"], disallow: ["/api/", "/oauth/"] },
    sitemap: `${appOrigin()}/sitemap.xml`,
  };
}
