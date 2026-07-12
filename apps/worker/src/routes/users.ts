import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type User,
  type PaginatedResult,
  createUserSchema,
  resetPasswordSchema,
  setPinSchema,
  updateUserSchema,
  userQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  resetPassword,
  setPin,
  updateUser,
} from '../services/user.service';

/**
 * User management routes.
 *
 * All routes require authentication + specific permissions.
 */
export const userRoutes = new Hono<AppContext>();

userRoutes.use('*', authMiddleware);

// ─── GET /users ────────────────────────────────────────────────────
userRoutes.get(
  '/',
  requirePermission('users.view'),
  zValidator('query', userQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listUsers(supabase, query);

    const response: ApiResponse<PaginatedResult<User>> = {
      success: true,
      data: result,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      },
    };
    return c.json(response, 200);
  },
);

// ─── GET /users/:id ────────────────────────────────────────────────
userRoutes.get('/:id', requirePermission('users.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const user = await getUser(supabase, id);

  const response: ApiResponse<User> = { success: true, data: user };
  return c.json(response, 200);
});

// ─── POST /users ───────────────────────────────────────────────────
userRoutes.post('/', requirePermission('users.create'), zValidator('json', createUserSchema), async (c) => {
  const input = c.req.valid('json');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const user = await createUser(supabase, input, actor);

  const response: ApiResponse<User> = {
    success: true,
    data: user,
  };
  return c.json(response, 201);
});

// ─── PATCH /users/:id ──────────────────────────────────────────────
userRoutes.patch(
  '/:id',
  requirePermission('users.edit'),
  zValidator('json', updateUserSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const user = await updateUser(supabase, id, input, actor);

    const response: ApiResponse<User> = { success: true, data: user };
    return c.json(response, 200);
  },
);

// ─── POST /users/:id/reset-password ────────────────────────────────
userRoutes.post(
  '/:id/reset-password',
  requirePermission('users.edit'),
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    await resetPassword(supabase, id, input.newPassword, actor);

    const response: ApiResponse<null> = { success: true, data: null };
    return c.json(response, 200);
  },
);

// ─── POST /users/:id/pin ───────────────────────────────────────────
userRoutes.post(
  '/:id/pin',
  requirePermission('users.edit'),
  zValidator('json', setPinSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    await setPin(supabase, id, input.pin, actor);

    const response: ApiResponse<null> = { success: true, data: null };
    return c.json(response, 200);
  },
);

// ─── DELETE /users/:id ─────────────────────────────────────────────
userRoutes.delete('/:id', requirePermission('users.delete'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteUser(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
