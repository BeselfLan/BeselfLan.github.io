import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ["@beself/content"],
  // Stops `next dev` from writing AGENTS.md when it detects a coding agent.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// `page.dev.tsx` is a route under `next dev` only, so it never ships.
export default function config(phase: string): NextConfig {
  return phase === PHASE_DEVELOPMENT_SERVER
    ? { ...nextConfig, pageExtensions: ["tsx", "ts", "jsx", "js", "dev.tsx"] }
    : nextConfig;
}
