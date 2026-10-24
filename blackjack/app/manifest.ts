import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CountLab · Card counting trainer",
    short_name: "CountLab",
    description: "Hi-Lo card counting, strategy and index charts, bankroll calculator and session journal.",
    start_url: "/train/",
    display: "standalone",
    background_color: "#0B0D11",
    theme_color: "#0B0D11",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
