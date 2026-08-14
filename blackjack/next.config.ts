import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  basePath: "/blackjack",
  assetPrefix: "/blackjack",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
