import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import {
  ApiResponse,
  AppError,
  ERROR_CODES,
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  type SessionResponse,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { getReqSupabase } from '../middleware/auth';
import {
  auditLogout,
  changePassword,
  getCurrentUser,
  loginWithPassword,
  refreshSession,
  resolveSession,
} from '../services/auth.service';

/**
 * Auth routes.
 *
 * Endpoints:
 *  POST   /auth/login           — Login with username + password. Returns access+refresh tokens.
 *  POST   /auth/refresh         — Exchange refresh token for a new access token.
 *  POST   /auth/logout          — Invalidate current session (clears cookies).
 *  GET    /auth/me              — Get current user (requires Authorization header).
 *  POST   /auth/change-password — Change own password (requires auth).
 */
export const authRoutes = new Hono<AppContext>();

const REFRESH_COOKIE = 'mse-refresh';
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// ─── POST /auth/login ──────────────────────────────────────────────
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const body = c.req.valid('json');
  const supabase = getReqSupabase(c);

  const { session, refreshToken } = await loginWithPassword(
    supabase,
    c.env.JWT_SECRET,
    body,
    {
      ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For'),
      userAgent: c.req.header('User-Agent'),
    },
  );

  // Set refresh token in httpOnly cookie for browser clients.
  setCookie(c, REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  const response: ApiResponse<SessionResponse> = {
    success: true,
    data: session,
  };
  return c.json(response, 200);
});

// ─── POST /auth/refresh ────────────────────────────────────────────
authRoutes.post('/refresh', zValidator('json', refreshSchema.optional()), async (c) => {
  // Accept refresh token from body OR cookie.
  const body = c.req.valid('json');
  const refreshToken = body?.refreshToken ?? getCookie(c, REFRESH_COOKIE);

  if (!refreshToken) {
    throw new AppError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Refresh token غير موجود');
  }

  const supabase = getReqSupabase(c);
  const { accessToken, expiresIn } = await refreshSession(
    supabase,
    c.env.JWT_SECRET,
    refreshToken,
  );

  const response: ApiResponse<{ accessToken: string; expiresIn: number }> = {
    success: true,
    data: { accessToken, expiresIn },
  };
  return c.json(response, 200);
});

// ─── POST /auth/logout ─────────────────────────────────────────────
authRoutes.post('/logout', async (c) => {
  const supabase = getReqSupabase(c);
  const authHeader = c.req.header('Authorization');
  await auditLogout(supabase, c.env.JWT_SECRET, authHeader);

  deleteCookie(c, REFRESH_COOKIE, { path: '/' });

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});

// ─── GET /auth/me ──────────────────────────────────────────────────
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    throw new AppError(ERROR_CODES.AUTH_NO_SESSION, 'يجب تسجيل الدخول');
  }

  const supabase = getReqSupabase(c);
  const session = await getCurrentUser(supabase, c.env.JWT_SECRET, authHeader);

  const response: ApiResponse<SessionResponse> = {
    success: true,
    data: session,
  };
  return c.json(response, 200);
});

// ─── POST /auth/change-password ────────────────────────────────────
authRoutes.post(
  '/change-password',
  zValidator('json', changePasswordSchema),
  async (c) => {
    const body = c.req.valid('json');
    const supabase = getReqSupabase(c);
    const authHeader = c.req.header('Authorization');

    await changePassword(supabase, c.env.JWT_SECRET, authHeader, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });

    const response: ApiResponse<null> = { success: true, data: null };
    return c.json(response, 200);
  },
);

// ─── Helper: validate session (used by /me implicitly) ─────────────
// Re-export for other modules that need to resolve the current user.
export async function resolveCurrentUser(c: Context<AppContext>) {
  const authHeader = c.req.header('Authorization');
  return resolveSession(c.env.JWT_SECRET, authHeader);
}
