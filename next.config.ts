import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",
  ],
};

export default nextConfig;

// Only run during local development — NOT during CI/production builds.
// During `next build` (Cloudflare Pages CI), NODE_ENV is "production",
// so this is skipped and the missing Hyperdrive local connection string
// no longer causes a build failure.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
