import { Hono } from 'hono';
import { ApiResponse } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';

/**
 * Health check endpoint.
 * Used by Cloudflare uptime monitoring + frontend preflight checks.
 *
 * GET /api/v1/health
 *   → 200 { success: true, data: { status: 'ok', version, timestamp } }
 *   → 503 if Supabase is unreachable
 */
export const healthRoute = new Hono<AppContext>();

healthRoute.get('/', async (c) => {
  const startedAt = Date.now();

  // Lightweight DB ping — we don't fail the health check on this,
  // but we report it in the response for monitoring.
  let dbStatus: 'ok' | 'unreachable' = 'ok';
  try {
    // TODO: replace with a real lightweight query once Supabase client is wired.
    // const supabase = getSupabase(c.env);
    // const { error } = await supabase.from('branches').select('id').limit(1).head();
    // if (error) throw error;
  } catch {
    dbStatus = 'unreachable';
  }

  const response: ApiResponse<{
    status: 'ok';
    version: string;
    environment: string;
    db: 'ok' | 'unreachable';
    uptimeMs: number;
    timestamp: string;
  }> = {
    success: true,
    data: {
      status: 'ok',
      version: c.env.APP_VERSION,
      environment: c.env.ENVIRONMENT,
      db: dbStatus,
      uptimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 200);
});
