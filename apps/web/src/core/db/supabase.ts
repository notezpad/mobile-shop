import { createBrowserClient } from '@mobile-shop/db';
import { env } from '../config/env';

/**
 * Singleton Supabase client for the browser PWA.
 * Auto-persists session to localStorage (key: 'mse-auth').
 *
 * Used by:
 *  - Auth module (sign in / sign out / refresh)
 *  - Realtime subscriptions (sync engine)
 *
 * Regular CRUD operations go through the Worker API (Repository layer),
 * NOT directly through this client — that way auth & RBAC are enforced server-side.
 */
let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient({
      supabaseUrl: env.VITE_SUPABASE_URL,
      supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
    });
  }
  return supabaseInstance;
}
