import type { MetadataRoute } from "next";
import { LEGACY_REDIRECTS, ROUTES } from "@/lib/routes";

const SITE_URL = "https://countlab.ca";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES
    // The admin dashboard is access-controlled and not meant to be indexed or
    // linked publicly, and the legacy aliases only redirect to a canonical page.
    .filter((segments) => segments[0] !== "admin" && !(segments.join("/") in LEGACY_REDIRECTS))
    .map((segments) => ({
      url: `${SITE_URL}/${segments.join("/")}${segments.length ? "/" : ""}`,
      lastModified: new Date(),
    }));
}
