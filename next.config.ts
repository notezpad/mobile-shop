import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // ── Server-external packages ─────────────────────────────────────────────
  // Packages listed here are NOT bundled into the Worker JS file.
  // Instead, they are resolved at runtime by the Workers runtime.
  //
  // Rule: any package that (a) ships native/Workers-specific code,
  // (b) is client-only and should never run on the server,
  // or (c) is very large and would bloat the Worker bundle — goes here.
  serverExternalPackages: [
    // ── Prisma / Postgres ── (Workers-specific code paths)
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",

    // ── Heavy editor (client-only, ~5 MB) ──
    // Never runs on the server; keeping it external prevents it from being
    // bundled into the Worker and exceeding resource limits.
    "@mdxeditor/editor",

    // ── Other large client-only packages ──
    "react-syntax-highlighter",
    "xlsx-js-style",
    "jsbarcode",
  ],
};

export default nextConfig;

// Enables `getCloudflareContext()` during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
