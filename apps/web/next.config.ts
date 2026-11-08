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
      // Tailwind runs on global stylesheets only. `as: "*.css"` turns the
      // loader's output into global CSS, so a matched `.module.css` lost its
      // scoping (#86). Modules use Turbopack's own CSS Module handling and
      // plain CSS: the tokens are CSS variables, so they need no Tailwind.
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
        condition: { not: { path: /\.module\.css$/ } },
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
