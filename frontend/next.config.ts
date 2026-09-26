import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname, "..") },
  // No floating "N" badge over the demo; compile and runtime errors still show.
  devIndicators: false,
};

export default nextConfig;
