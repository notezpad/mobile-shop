import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type PaginatedResult,
  type SaleWithDetails,
  createSaleSchema,
  saleQuerySchema,
  voidSaleSchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createSale, getSaleWithDetails, listSales, voidSale } from '../services/sale.service';

/**
 * Sales routes.
 *
 * Endpoints:
 *  GET    /sales          — List (paginated, filtered).
 *  GET    /sales/:id      — Get sale with items + payments + names.
 *  POST   /sales          — Create sale (POS checkout — atomic).
 *  POST   /sales/:id/void — Void a sale (reverse stock + balance).
 */
export const saleRoutes = new Hono<AppContext>();

saleRoutes.use('*', authMiddleware);

// ─── GET /sales ────────────────────────────────────────────────────
saleRoutes.get(
  '/',
  requirePermission('sales.view'),
  zValidator('query', saleQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listSales(supabase, query);

    const response: ApiResponse<PaginatedResult<SaleWithDetails>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /sales/:id ────────────────────────────────────────────────
saleRoutes.get('/:id', requirePermission('sales.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const sale = await getSaleWithDetails(supabase, id);

  const response: ApiResponse<SaleWithDetails> = { success: true, data: sale };
  return c.json(response, 200);
});

// ─── POST /sales ───────────────────────────────────────────────────
saleRoutes.post(
  '/',
  requirePermission('sales.create'),
  zValidator('json', createSaleSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    // Override cashierId with the authenticated user.
    const sale = await createSale(supabase, { ...input, cashierId: actor.id }, actor);

    const response: ApiResponse<SaleWithDetails> = { success: true, data: sale };
    return c.json(response, 201);
  },
);

// ─── POST /sales/:id/void ──────────────────────────────────────────
saleRoutes.post(
  '/:id/void',
  requirePermission('sales.void'),
  zValidator('json', voidSaleSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const sale = await voidSale(supabase, id, input, actor);

    const response: ApiResponse<typeof sale> = { success: true, data: sale };
    return c.json(response, 200);
  },
);
