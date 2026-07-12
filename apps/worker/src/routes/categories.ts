import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Category,
  createCategorySchema,
  updateCategorySchema,
  categoryQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '../services/category.service';

export const categoryRoutes = new Hono<AppContext>();

categoryRoutes.use('*', authMiddleware);

// ─── GET /categories ───────────────────────────────────────────────
categoryRoutes.get(
  '/',
  requirePermission('catalog.products.view'),
  zValidator('query', categoryQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const categories = await listCategories(supabase, query);

    const response: ApiResponse<Category[]> = { success: true, data: categories };
    return c.json(response, 200);
  },
);

// ─── GET /categories/:id ───────────────────────────────────────────
categoryRoutes.get('/:id', requirePermission('catalog.products.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const category = await getCategory(supabase, id);

  const response: ApiResponse<Category> = { success: true, data: category };
  return c.json(response, 200);
});

// ─── POST /categories ──────────────────────────────────────────────
categoryRoutes.post(
  '/',
  requirePermission('catalog.categories.manage'),
  zValidator('json', createCategorySchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const category = await createCategory(supabase, input, actor);

    const response: ApiResponse<Category> = { success: true, data: category };
    return c.json(response, 201);
  },
);

// ─── PATCH /categories/:id ─────────────────────────────────────────
categoryRoutes.patch(
  '/:id',
  requirePermission('catalog.categories.manage'),
  zValidator('json', updateCategorySchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const category = await updateCategory(supabase, id, input, actor);

    const response: ApiResponse<Category> = { success: true, data: category };
    return c.json(response, 200);
  },
);

// ─── DELETE /categories/:id ────────────────────────────────────────
categoryRoutes.delete('/:id', requirePermission('catalog.categories.manage'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteCategory(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
