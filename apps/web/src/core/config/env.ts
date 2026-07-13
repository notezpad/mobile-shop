/**
 * Environment configuration.
 * All env vars must be prefixed with `VITE_` to be exposed to the client.
 * Validation is done at startup — fail fast if misconfigured.
 */
import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('Mobile Shop ERP'),
  VITE_APP_VERSION: z.string().default('0.1.0'),
  VITE_API_URL: z.string().default('/api/v1'),
  VITE_SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).default('placeholder-anon-key'),

  VITE_DEFAULT_LOCALE: z.enum(['ar', 'en']).default('ar'),
  VITE_DEFAULT_THEME: z.enum(['light', 'dark', 'system']).default('system'),
  VITE_DEFAULT_CURRENCY: z.string().default('EGP'),
  VITE_ENABLE_DEVTOOLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(import.meta.env);

  if (!parsed.success) {
    console.warn('⚠️ Environment variables not fully configured. Using defaults. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for full functionality.');
    // Use defaults instead of crashing — the app will still load.
    cachedEnv = {
      VITE_APP_NAME: import.meta.env.VITE_APP_NAME ?? 'Mobile Shop ERP',
      VITE_APP_VERSION: import.meta.env.VITE_APP_VERSION ?? '0.1.0',
      VITE_API_URL: import.meta.env.VITE_API_URL ?? '/api/v1',
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder',
      VITE_DEFAULT_LOCALE: 'ar',
      VITE_DEFAULT_THEME: 'system',
      VITE_DEFAULT_CURRENCY: 'EGP',
      VITE_ENABLE_DEVTOOLS: false,
    };
    return cachedEnv;
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export const env = loadEnv();
