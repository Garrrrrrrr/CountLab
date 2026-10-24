import type { Metadata } from "next";
import { isPublicPath, pageInfo } from "./routes";

/** Per-page metadata from the site map, with a trailing-slash canonical to match the export. */
export function pageMetadata(path: string): Metadata {
  const { title, description } = pageInfo(path);
  const canonical = path === "/" ? "/" : `${path}/`;
  return {
    title: path === "/" ? { absolute: `CountLab · ${title}` } : title,
    description,
    alternates: { canonical },
    robots: { index: isPublicPath(path), follow: true },
    openGraph: { title, description, url: canonical },
    twitter: { title, description, card: "summary_large_image" },
  };
}

/** Old URLs stay out of search results and point at their new home. */
export function legacyMetadata(to: string): Metadata {
  return { title: "Moved", robots: { index: false, follow: true }, alternates: { canonical: to === "/" ? "/" : `${to}/` } };
}
