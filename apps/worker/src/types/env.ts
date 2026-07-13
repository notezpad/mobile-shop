/**
 * Cloudflare Worker environment bindings.
 * Secrets are injected via `wrangler secret put` (production) or `.dev.vars` (dev).
 */
export interface Env {
  // ─── Supabase ─────────────────────────────────────────────────
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // ─── Auth ─────────────────────────────────────────────────────
  JWT_SECRET: string;

  // ─── App config (non-secret) ──────────────────────────────────
  ENVIRONMENT: 'development' | 'staging' | 'production';
  APP_NAME: string;
  APP_VERSION: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  CORS_ORIGIN: string;

  // ─── Static assets (apps/web/dist) ────────────────────────────
  ASSETS: Fetcher;

  // ─── Future bindings ──────────────────────────────────────────
  // CACHE: KVNamespace;
  // SYNC_COORDINATOR: DurableObjectNamespace;
}

/** Hono app context extended with our env + auth state. */
export interface AppContext {
  Bindings: Env;
  Variables: {
    requestId: string;
    startedAt: number;
    user?: {
      id: string;
      username: string;
      roleId: string;
      roleKey: string;
      branchId: string | null;
      tenantId: string | null;
      permissions: string[];
    };
  };
}
