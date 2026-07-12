import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Role,
  type Permission,
  assignPermissionsSchema,
  createRoleSchema,
  updateRoleSchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  assignPermissions,
  createRole,
  deleteRole,
  getRole,
  getRolePermissions,
  listPermissions,
  listRoles,
  updateRole,
} from '../services/role.service';

/**
 * Role & permission management routes.
 *
 * Endpoints:
 *  GET    /roles                 — List all roles.
 *  GET    /roles/:id             — Get a role with its permissions.
 *  POST   /roles                 — Create a custom role.
 *  PATCH  /roles/:id             — Update role metadata.
 *  DELETE /roles/:id             — Soft-delete a custom role.
 *  PUT    /roles/:id/permissions — Replace a role's permissions.
 *  GET    /permissions           — List all permissions.
 */
export const roleRoutes = new Hono<AppContext>();

roleRoutes.use('*', authMiddleware);

// ─── GET /roles ────────────────────────────────────────────────────
roleRoutes.get('/', requirePermission('roles.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const roles = await listRoles(supabase);

  const response: ApiResponse<Role[]> = { success: true, data: roles };
  return c.json(response, 200);
});

// ─── GET /roles/:id ────────────────────────────────────────────────
roleRoutes.get('/:id', requirePermission('roles.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const result = await getRole(supabase, id);

  const response: ApiResponse<{ role: Role; permissions: Permission[] }> = {
    success: true,
    data: result,
  };
  return c.json(response, 200);
});

// ─── POST /roles ───────────────────────────────────────────────────
roleRoutes.post(
  '/',
  requirePermission('roles.manage'),
  zValidator('json', createRoleSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const role = await createRole(supabase, input, actor);

    const response: ApiResponse<Role> = { success: true, data: role };
    return c.json(response, 201);
  },
);

// ─── PATCH /roles/:id ──────────────────────────────────────────────
roleRoutes.patch(
  '/:id',
  requirePermission('roles.manage'),
  zValidator('json', updateRoleSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const role = await updateRole(supabase, id, input, actor);

    const response: ApiResponse<Role> = { success: true, data: role };
    return c.json(response, 200);
  },
);

// ─── PUT /roles/:id/permissions ────────────────────────────────────
roleRoutes.put(
  '/:id/permissions',
  requirePermission('roles.manage'),
  zValidator('json', assignPermissionsSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    await assignPermissions(supabase, id, input, actor);

    const permissions = await getRolePermissions(supabase, id);
    const response: ApiResponse<Permission[]> = { success: true, data: permissions };
    return c.json(response, 200);
  },
);

// ─── DELETE /roles/:id ─────────────────────────────────────────────
roleRoutes.delete('/:id', requirePermission('roles.manage'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteRole(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});

// ─── GET /permissions ──────────────────────────────────────────────
export const permissionRoutes = new Hono<AppContext>();

permissionRoutes.use('*', authMiddleware);

permissionRoutes.get('/', requirePermission('roles.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const permissions = await listPermissions(supabase);

  const response: ApiResponse<Permission[]> = { success: true, data: permissions };
  return c.json(response, 200);
});
