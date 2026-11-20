import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.REVIEW_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(process.cwd()),
  outputFileTracingExcludes: { "/*": ["./data/local-publication/**"] },
};

export default nextConfig;
