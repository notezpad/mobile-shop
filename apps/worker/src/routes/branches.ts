import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Branch,
  type PaginatedResult,
  createBranchSchema,
  updateBranchSchema,
  branchQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  createBranch,
  deleteBranch,
  getBranch,
  listActiveBranches,
  listBranches,
  updateBranch,
} from '../services/branch.service';

/**
 * Branch management routes.
 *
 * Endpoints:
 *  GET    /branches             — List with pagination/filters.
 *  GET    /branches/active      — List active branches only (for dropdowns).
 *  GET    /branches/:id         — Get one branch.
 *  POST   /branches             — Create.
 *  PATCH  /branches/:id         — Update.
 *  DELETE /branches/:id         — Soft-delete (cannot delete main branch).
 */
export const branchRoutes = new Hono<AppContext>();

branchRoutes.use('*', authMiddleware);

// ─── GET /branches ─────────────────────────────────────────────────
branchRoutes.get(
  '/',
  requirePermission('branches.view'),
  zValidator('query', branchQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listBranches(supabase, query);

    const response: ApiResponse<PaginatedResult<Branch>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /branches/active ──────────────────────────────────────────
// Lightweight endpoint for dropdown selectors.
branchRoutes.get('/active', requirePermission('branches.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const branches = await listActiveBranches(supabase);

  const response: ApiResponse<Branch[]> = { success: true, data: branches };
  return c.json(response, 200);
});

// ─── GET /branches/:id ─────────────────────────────────────────────
branchRoutes.get('/:id', requirePermission('branches.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const branch = await getBranch(supabase, id);

  const response: ApiResponse<Branch> = { success: true, data: branch };
  return c.json(response, 200);
});

// ─── POST /branches ────────────────────────────────────────────────
branchRoutes.post(
  '/',
  requirePermission('branches.manage'),
  zValidator('json', createBranchSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const branch = await createBranch(supabase, input, actor);

    const response: ApiResponse<Branch> = { success: true, data: branch };
    return c.json(response, 201);
  },
);

// ─── PATCH /branches/:id ───────────────────────────────────────────
branchRoutes.patch(
  '/:id',
  requirePermission('branches.manage'),
  zValidator('json', updateBranchSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const branch = await updateBranch(supabase, id, input, actor);

    const response: ApiResponse<Branch> = { success: true, data: branch };
    return c.json(response, 200);
  },
);

// ─── DELETE /branches/:id ──────────────────────────────────────────
branchRoutes.delete('/:id', requirePermission('branches.manage'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteBranch(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
