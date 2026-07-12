import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type PaginatedResult,
  type ReturnWithDetails,
  createReturnSchema,
  returnQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  approveAndCompleteReturn,
  createReturn,
  getReturnWithDetails,
  listReturns,
  rejectReturn,
} from '../services/return.service';

export const returnRoutes = new Hono<AppContext>();

returnRoutes.use('*', authMiddleware);

// ─── GET /returns ──────────────────────────────────────────────────
returnRoutes.get(
  '/',
  requirePermission('returns.view'),
  zValidator('query', returnQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listReturns(supabase, query);

    const response: ApiResponse<PaginatedResult<ReturnWithDetails>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /returns/:id ──────────────────────────────────────────────
returnRoutes.get('/:id', requirePermission('returns.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const ret = await getReturnWithDetails(supabase, id);

  const response: ApiResponse<ReturnWithDetails> = { success: true, data: ret };
  return c.json(response, 200);
});

// ─── POST /returns ─────────────────────────────────────────────────
returnRoutes.post(
  '/',
  requirePermission('returns.create'),
  zValidator('json', createReturnSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const ret = await createReturn(supabase, input, actor);

    const response: ApiResponse<ReturnWithDetails> = { success: true, data: ret };
    return c.json(response, 201);
  },
);

// ─── POST /returns/:id/approve ─────────────────────────────────────
returnRoutes.post('/:id/approve', requirePermission('returns.approve'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const ret = await approveAndCompleteReturn(supabase, id, actor);

  const response: ApiResponse<ReturnWithDetails> = { success: true, data: ret };
  return c.json(response, 200);
});

// ─── POST /returns/:id/reject ──────────────────────────────────────
returnRoutes.post('/:id/reject', requirePermission('returns.approve'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const ret = await rejectReturn(supabase, id, actor);

  const response: ApiResponse<ReturnWithDetails> = { success: true, data: ret };
  return c.json(response, 200);
});
