/**
 * Supabase client factory.
 *
 * Two flavors:
 *  - `createBrowserClient()`: for apps/web — uses `supabase-js` with auto session storage.
 *  - `createServerClient()`:  for apps/worker — uses service-role key, no session storage.
 *
 * Both share the same generated types from `src/generated/database.types.ts`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './generated/database.types';

export type { Database } from './generated/database.types';

interface BrowserClientOptions {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Optional: persistence override (default: localStorage). */
  storage?: {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => void | Promise<void>;
    removeItem: (key: string) => void | Promise<void>;
  };
}

/**
 * Browser Supabase client (frontend PWA).
 * Uses anon key + user JWT. Auto-persists session for offline re-auth.
 */
export function createBrowserClient(opts: BrowserClientOptions): SupabaseClient<Database> {
  return createClient<Database>(opts.supabaseUrl, opts.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: opts.storage,
      storageKey: 'mse-auth',
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
    global: {
      headers: { 'x-client-info': 'mobile-shop-erp-web/0.1.0' },
    },
  });
}

interface ServerClientOptions {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Optional request-scoped headers (e.g. user JWT forwarding). */
  headers?: Record<string, string>;
}

/**
 * Server-side Supabase client (Cloudflare Worker).
 * Uses service-role key — bypasses RLS. RBAC enforced in app layer.
 */
export function createServerClient(opts: ServerClientOptions): SupabaseClient<Database> {
  return createClient<Database>(opts.supabaseUrl, opts.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'x-client-info': 'mobile-shop-erp-worker/0.1.0',
        ...opts.headers,
      },
    },
  });
}

/**
 * Auth-scoped server client — uses the user's JWT to enforce RLS.
 * Use this for user-initiated operations. Falls back to service-role for system ops.
 *
 * NOTE: We accept url+key explicitly because SupabaseClient's properties are protected.
 */
export function createAuthScopedClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  userJwt: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${userJwt}` },
    },
  });
}
