import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // These packages ship workerd-specific code paths (conditional "exports"
  // in their package.json). Next.js's default bundler (esbuild, via
  // OpenNext) doesn't resolve those correctly and fails with
  // `Could not resolve "pg-cloudflare"`. Marking them external tells
  // Next.js to leave them as real require()/import calls resolved at
  // runtime by the Workers runtime instead of trying to bundle them.
  // See: https://opennext.js.org/cloudflare/howtos/workerd
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",
  ],
};

export default nextConfig;

// Enables `getCloudflareContext()` (bindings, env vars) during `next dev`,
// so local development matches the Cloudflare Workers runtime.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
