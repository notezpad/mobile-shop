import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },

  // FIX (Cloudflare/OpenNext build): OpenNext's file tracer runs in Node and
  // resolves `pg-cloudflare` through the `default` export condition, which is
  // an EMPTY stub ("./dist/empty.js"). Later, the workerd-conditioned esbuild
  // pass needs "./dist/index.js" (the real CloudflareSocket) which was never
  // copied into .open-next/server-functions/default/node_modules → build error:
  //   ERROR: Could not resolve "pg-cloudflare"
  // Forcing these paths into the output trace makes the real files get copied.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/package.json"],
  },
};

export default nextConfig;
