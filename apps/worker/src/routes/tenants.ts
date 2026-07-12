import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Tenant,
  tenantSignupSchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { signupTenant, getUserTenants, getTenantBySlug } from '../services/tenant.service';
import type { SessionResponse } from '@mobile-shop/shared';

/**
 * Tenant routes — SaaS onboarding + tenant management.
 *
 * Endpoints:
 *  POST   /tenants/signup     — Create new tenant + first admin (public)
 *  GET    /tenants/slug/:slug  — Get tenant by slug (public — for subdomain resolution)
 *  GET    /tenants/mine        — List user's tenants (auth required)
 */
export const tenantRoutes = new Hono<AppContext>();

// ─── POST /tenants/signup (PUBLIC — no auth) ──────────────────────
tenantRoutes.post(
  '/signup',
  zValidator('json', tenantSignupSchema),
  async (c) => {
    const input = c.req.valid('json');
    const supabase = getReqSupabase(c);
    const result = await signupTenant(supabase, input, c.env.JWT_SECRET);

    // Set refresh cookie.
    c.header('Set-Cookie', `mse-refresh=${result.refreshToken}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);

    const response: ApiResponse<{
      tenant: Tenant;
      accessToken: string;
      refreshToken: string;
    }> = {
      success: true,
      data: {
        tenant: result.tenant,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    };
    return c.json(response, 201);
  },
);

// ─── GET /tenants/slug/:slug (PUBLIC) ─────────────────────────────
tenantRoutes.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const supabase = getReqSupabase(c);
  const tenant = await getTenantBySlug(supabase, slug);
  const response: ApiResponse<Tenant | null> = { success: true, data: tenant };
  return c.json(response, 200);
});

// ─── GET /tenants/mine (AUTH) ─────────────────────────────────────
tenantRoutes.get('/mine', authMiddleware, async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const tenants = await getUserTenants(supabase, actor.id);
  const response: ApiResponse<typeof tenants> = { success: true, data: tenants };
  return c.json(response, 200);
});

