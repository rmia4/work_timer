import type { MetadataRoute } from "next";
import { appOrigin } from "@/server/oauth/oauth";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/privacy", "/terms"].map((path) => ({ url: appOrigin() + path }));
}
