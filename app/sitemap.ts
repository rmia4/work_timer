import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/oauth";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/privacy", "/terms"].map((path) => ({ url: appOrigin() + path }));
}
