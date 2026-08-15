import type { MetadataRoute } from "next";
import { ROUTES } from "@/lib/routes";

const SITE_URL = "https://countlab.ca";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES
    // The admin dashboard is access-controlled and not meant to be indexed or linked publicly.
    .filter((segments) => segments[0] !== "admin")
    .map((segments) => ({
      url: `${SITE_URL}/${segments.join("/")}${segments.length ? "/" : ""}`,
      lastModified: new Date(),
    }));
}
