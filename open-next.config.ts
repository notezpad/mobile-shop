import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// FIX Error 1102 (2026-09-27): pages like /products, /pos, /dashboard are
// client-only shells prerendered at build time. Without an incremental cache
// the Worker re-rendered them on EVERY visit (wasting CPU). This serves the
// prebuilt HTML straight from static assets — near-zero Worker CPU.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
