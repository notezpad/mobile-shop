import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../types/env';

/**
 * Permissive Supabase client type used until generated DB types are wired.
 *
 * We use `any` here intentionally because the Supabase type system requires
 * a fully-shaped Database generic; without generated types, every query
 * infers `never`. Services cast results to concrete types from @mobile-shop/shared.
 *
 * Once `pnpm db:gen-types` runs against a real Supabase project, we'll
 * replace this with `SupabaseClient<Database>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseSupabaseClient = SupabaseClient<any>;

/**
 * Create a Supabase server client from Worker env bindings.
 * Uses service-role key — bypasses RLS. RBAC enforced in app layer.
 */
export function getSupabase(env: Env): LooseSupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { 'x-client-info': 'mobile-shop-erp-worker/0.1.0' },
    },
  }) as unknown as LooseSupabaseClient;
}
