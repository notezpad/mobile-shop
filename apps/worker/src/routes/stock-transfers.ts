import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type PaginatedResult,
  type StockTransfer,
  createStockTransferSchema,
  receiveStockTransferSchema,
  stockTransferQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  cancelTransfer,
  createTransfer,
  getTransfer,
  listTransfers,
  receiveTransfer,
  shipTransfer,
} from '../services/stock-transfer.service';

/**
 * Stock transfer routes — move stock between branches.
 *
 * Endpoints:
 *  GET    /stock-transfers          — List (paginated, filtered).
 *  GET    /stock-transfers/:id      — Get one transfer with items.
 *  POST   /stock-transfers          — Create (status: draft).
 *  POST   /stock-transfers/:id/ship — Ship (deduct from source).
 *  POST   /stock-transfers/:id/receive — Receive (add to destination).
 *  POST   /stock-transfers/:id/cancel — Cancel (return stock if in_transit).
 */
export const stockTransferRoutes = new Hono<AppContext>();

stockTransferRoutes.use('*', authMiddleware);

// ─── GET /stock-transfers ──────────────────────────────────────────
stockTransferRoutes.get(
  '/',
  requirePermission('inventory.transfer'),
  zValidator('query', stockTransferQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listTransfers(supabase, query);

    const response: ApiResponse<PaginatedResult<StockTransfer & { items?: unknown[] }>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /stock-transfers/:id ──────────────────────────────────────
stockTransferRoutes.get('/:id', requirePermission('inventory.transfer'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const transfer = await getTransfer(supabase, id);

  const response: ApiResponse<typeof transfer> = { success: true, data: transfer };
  return c.json(response, 200);
});

// ─── POST /stock-transfers ─────────────────────────────────────────
stockTransferRoutes.post(
  '/',
  requirePermission('inventory.transfer'),
  zValidator('json', createStockTransferSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const transfer = await createTransfer(supabase, input, actor);

    const response: ApiResponse<typeof transfer> = { success: true, data: transfer };
    return c.json(response, 201);
  },
);

// ─── POST /stock-transfers/:id/ship ────────────────────────────────
stockTransferRoutes.post('/:id/ship', requirePermission('inventory.transfer'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const transfer = await shipTransfer(supabase, id, actor);

  const response: ApiResponse<StockTransfer> = { success: true, data: transfer };
  return c.json(response, 200);
});

// ─── POST /stock-transfers/:id/receive ─────────────────────────────
stockTransferRoutes.post(
  '/:id/receive',
  requirePermission('inventory.transfer'),
  zValidator('json', receiveStockTransferSchema.optional()),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json') ?? {};
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const transfer = await receiveTransfer(supabase, id, input, actor);

    const response: ApiResponse<StockTransfer> = { success: true, data: transfer };
    return c.json(response, 200);
  },
);

// ─── POST /stock-transfers/:id/cancel ──────────────────────────────
stockTransferRoutes.post('/:id/cancel', requirePermission('inventory.transfer'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const transfer = await cancelTransfer(supabase, id, actor);

  const response: ApiResponse<StockTransfer> = { success: true, data: transfer };
  return c.json(response, 200);
});
