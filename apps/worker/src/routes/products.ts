import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Product,
  type PaginatedResult,
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from '../services/product.service';

export const productRoutes = new Hono<AppContext>();

productRoutes.use('*', authMiddleware);

// ─── GET /products ─────────────────────────────────────────────────
productRoutes.get(
  '/',
  requirePermission('catalog.products.view'),
  zValidator('query', productQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const actor = requireUser(c);
    const result = await listProducts(supabase, query, actor.branchId);

    const response: ApiResponse<PaginatedResult<Product & { stock_level?: number }>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /products/:id ─────────────────────────────────────────────
productRoutes.get('/:id', requirePermission('catalog.products.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  const product = await getProduct(supabase, id, actor.branchId);

  const response: ApiResponse<typeof product> = { success: true, data: product };
  return c.json(response, 200);
});

// ─── POST /products ────────────────────────────────────────────────
productRoutes.post(
  '/',
  requirePermission('catalog.products.create'),
  zValidator('json', createProductSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const product = await createProduct(supabase, input, actor);

    const response: ApiResponse<Product> = { success: true, data: product };
    return c.json(response, 201);
  },
);

// ─── PATCH /products/:id ───────────────────────────────────────────
productRoutes.patch(
  '/:id',
  requirePermission('catalog.products.edit'),
  zValidator('json', updateProductSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const product = await updateProduct(supabase, id, input, actor);

    const response: ApiResponse<Product> = { success: true, data: product };
    return c.json(response, 200);
  },
);

// ─── DELETE /products/:id ──────────────────────────────────────────
productRoutes.delete('/:id', requirePermission('catalog.products.delete'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteProduct(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
