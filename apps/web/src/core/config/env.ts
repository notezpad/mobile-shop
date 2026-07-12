/**
 * Environment configuration.
 * All env vars must be prefixed with `VITE_` to be exposed to the client.
 * Validation is done at startup — fail fast if misconfigured.
 */
import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('Mobile Shop ERP'),
  VITE_APP_VERSION: z.string().default('0.1.0'),
  VITE_API_URL: z.string().url().default('http://localhost:8787/api/v1'),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),

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
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error(
      'Missing or invalid environment variables. Check .env file. Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY',
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export const env = loadEnv();
