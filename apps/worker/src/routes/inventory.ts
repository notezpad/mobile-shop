import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type PaginatedResult,
  type StockMovement,
  stockLevelQuerySchema,
  stockMovementQuerySchema,
  batchStockAdjustmentSchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { listStockLevels, getStockSummary, type StockLevel } from '../services/inventory.service';
import { listMovements, recordBatchAdjustments } from '../services/stock-movement.service';

/**
 * Inventory routes.
 *
 * Endpoints:
 *  GET    /inventory                  — Stock levels (paginated, filtered).
 *  GET    /inventory/summary          — KPI summary (total value, low-stock count).
 *  GET    /inventory/movements        — Movement history.
 *  POST   /inventory/adjustments      — Batch stocktake adjustments.
 */
export const inventoryRoutes = new Hono<AppContext>();

inventoryRoutes.use('*', authMiddleware);

// ─── GET /inventory ────────────────────────────────────────────────
inventoryRoutes.get(
  '/',
  requirePermission('inventory.view'),
  zValidator('query', stockLevelQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listStockLevels(supabase, query);

    const response: ApiResponse<PaginatedResult<StockLevel>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /inventory/summary ────────────────────────────────────────
inventoryRoutes.get('/summary', requirePermission('inventory.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  // If user has a branch, scope to it (unless super_admin/admin).
  const branchId = actor.roleKey === 'super_admin' || actor.roleKey === 'admin'
    ? undefined
    : actor.branchId ?? undefined;
  const summary = await getStockSummary(supabase, branchId);

  const response: ApiResponse<typeof summary> = { success: true, data: summary };
  return c.json(response, 200);
});

// ─── GET /inventory/movements ──────────────────────────────────────
inventoryRoutes.get(
  '/movements',
  requirePermission('inventory.view'),
  zValidator('query', stockMovementQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listMovements(supabase, query);

    const response: ApiResponse<PaginatedResult<StockMovement>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── POST /inventory/adjustments ───────────────────────────────────
inventoryRoutes.post(
  '/adjustments',
  requirePermission('inventory.stocktake'),
  zValidator('json', batchStockAdjustmentSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const movements = await recordBatchAdjustments(supabase, input, actor);

    const response: ApiResponse<StockMovement[]> = {
      success: true,
      data: movements,
    };
    return c.json(response, 201);
  },
);

export {}; // mark as module
