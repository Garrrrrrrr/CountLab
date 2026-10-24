import type { MetadataRoute } from "next";
import { PAGES } from "@/lib/routes";

const SITE_URL = "https://countlab.ca";

export const dynamic = "force-static";

/** Public pages only: the workspace is per-reader and the old URLs only redirect. */
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(PAGES)
    .filter(([path, info]) => info.public && path !== "/signin")
    .map(([path]) => ({ url: `${SITE_URL}${path === "/" ? "/" : `${path}/`}`, lastModified: new Date() }));
}
