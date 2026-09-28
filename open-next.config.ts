import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Using default in-memory/incremental cache for now.
  // For production, consider wiring up R2 or KV for the ISR/data cache —
  // see: https://opennext.js.org/cloudflare/caching
});
