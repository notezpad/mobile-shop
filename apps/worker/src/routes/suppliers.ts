import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Supplier,
  type PaginatedResult,
  createSupplierSchema,
  updateSupplierSchema,
  adjustSupplierBalanceSchema,
  supplierQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  adjustSupplierBalance,
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from '../services/supplier.service';

export const supplierRoutes = new Hono<AppContext>();

supplierRoutes.use('*', authMiddleware);

// ─── GET /suppliers ────────────────────────────────────────────────
supplierRoutes.get(
  '/',
  requirePermission('catalog.suppliers.manage'),
  zValidator('query', supplierQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listSuppliers(supabase, query);

    const response: ApiResponse<PaginatedResult<Supplier>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /suppliers/:id ────────────────────────────────────────────
supplierRoutes.get('/:id', requirePermission('catalog.suppliers.manage'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const supplier = await getSupplier(supabase, id);

  const response: ApiResponse<Supplier> = { success: true, data: supplier };
  return c.json(response, 200);
});

// ─── POST /suppliers ───────────────────────────────────────────────
supplierRoutes.post(
  '/',
  requirePermission('catalog.suppliers.manage'),
  zValidator('json', createSupplierSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const supplier = await createSupplier(supabase, input, actor);

    const response: ApiResponse<Supplier> = { success: true, data: supplier };
    return c.json(response, 201);
  },
);

// ─── PATCH /suppliers/:id ──────────────────────────────────────────
supplierRoutes.patch(
  '/:id',
  requirePermission('catalog.suppliers.manage'),
  zValidator('json', updateSupplierSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const supplier = await updateSupplier(supabase, id, input, actor);

    const response: ApiResponse<Supplier> = { success: true, data: supplier };
    return c.json(response, 200);
  },
);

// ─── POST /suppliers/:id/adjust-balance ────────────────────────────
supplierRoutes.post(
  '/:id/adjust-balance',
  requirePermission('catalog.suppliers.manage'),
  zValidator('json', adjustSupplierBalanceSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const supplier = await adjustSupplierBalance(supabase, id, input, actor);

    const response: ApiResponse<Supplier> = { success: true, data: supplier };
    return c.json(response, 200);
  },
);

// ─── DELETE /suppliers/:id ─────────────────────────────────────────
supplierRoutes.delete('/:id', requirePermission('catalog.suppliers.manage'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteSupplier(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
