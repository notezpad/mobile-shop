/**
 * Auth middleware — extracts Bearer token, verifies, attaches user to context.
 * Throws AUTH_NO_SESSION if missing/invalid.
 *
 * Usage:
 *   app.use('/protected/*', authMiddleware);
 *   app.get('/protected/me', (c) => {
 *     const user = c.get('user'); // AccessTokenUser
 *   });
 */
import type { Context, MiddlewareHandler } from 'hono';
import { AppError, ERROR_CODES } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { resolveSession, type AccessTokenUser } from '../services/auth.service';
import { getSupabase, type LooseSupabaseClient } from '../lib/supabase';

export const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const jwtSecret = c.env.JWT_SECRET;

  try {
    const user = await resolveSession(jwtSecret, authHeader);
    c.set('user', user);
    await next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(ERROR_CODES.AUTH_TOKEN_INVALID, 'التوكن غير صالح');
  }
};

/** Optional auth — sets user if token present, but doesn't fail if missing. */
export const optionalAuthMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const user = await resolveSession(c.env.JWT_SECRET, authHeader);
      c.set('user', user);
    } catch {
      // ignore — proceed as anonymous.
    }
  }
  await next();
};

/**
 * Helper: extract the authenticated user from context.
 * Accepts any Hono context that has our Variables — Hono narrows context types
 * per-route, so we use `Context<AppContext>` for broad compatibility.
 */
export function requireUser(c: Context<AppContext>): AccessTokenUser {
  const user = c.get('user');
  if (!user) {
    throw new AppError(ERROR_CODES.AUTH_NO_SESSION, 'يجب تسجيل الدخول');
  }
  // Cast: Hono's typed routes lose the RoleKey enum narrowing — restore it here.
  return user as AccessTokenUser;
}

/** Helper: get a Supabase client bound to this request. */
export function getReqSupabase(c: Context<AppContext>): LooseSupabaseClient {
  return getSupabase(c.env);
}
