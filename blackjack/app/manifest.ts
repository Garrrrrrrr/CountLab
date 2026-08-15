import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CountLab · Blackjack Training",
    short_name: "CountLab",
    description: "Hi-Lo card counting and blackjack decision training.",
    start_url: "/",
    display: "standalone",
    background_color: "#101411",
    theme_color: "#101411",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
