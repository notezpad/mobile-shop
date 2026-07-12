import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type PaginatedResult,
  type RepairWithDetails,
  type RepairTrackingInfo,
  createRepairSchema,
  updateRepairSchema,
  changeRepairStatusSchema,
  addRepairPartSchema,
  deliverRepairSchema,
  repairQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  addPart,
  changeStatus,
  createRepair,
  deliverRepair,
  findByTicketNo,
  getRepairWithDetails,
  getTrackingInfo,
  listRepairs,
  removePart,
  updateRepair,
} from '../services/repair.service';

export const repairRoutes = new Hono<AppContext>();

repairRoutes.use('*', authMiddleware);

// ─── GET /repairs ──────────────────────────────────────────────────
repairRoutes.get(
  '/',
  requirePermission('repairs.view'),
  zValidator('query', repairQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listRepairs(supabase, query);

    const response: ApiResponse<PaginatedResult<RepairWithDetails>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /repairs/ticket/:ticketNo ─────────────────────────────────
repairRoutes.get('/ticket/:ticketNo', requirePermission('repairs.view'), async (c) => {
  const ticketNo = c.req.param('ticketNo');
  const supabase = getReqSupabase(c);
  const repair = await findByTicketNo(supabase, ticketNo);

  const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
  return c.json(response, 200);
});

// ─── GET /repairs/:id ──────────────────────────────────────────────
repairRoutes.get('/:id', requirePermission('repairs.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const repair = await getRepairWithDetails(supabase, id);

  const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
  return c.json(response, 200);
});

// ─── POST /repairs ─────────────────────────────────────────────────
repairRoutes.post(
  '/',
  requirePermission('repairs.create'),
  zValidator('json', createRepairSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const repair = await createRepair(supabase, input, actor);

    const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
    return c.json(response, 201);
  },
);

// ─── PATCH /repairs/:id ────────────────────────────────────────────
repairRoutes.patch(
  '/:id',
  requirePermission('repairs.edit'),
  zValidator('json', updateRepairSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const repair = await updateRepair(supabase, id, input, actor);

    const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
    return c.json(response, 200);
  },
);

// ─── POST /repairs/:id/status ──────────────────────────────────────
repairRoutes.post(
  '/:id/status',
  requirePermission('repairs.edit'),
  zValidator('json', changeRepairStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const repair = await changeStatus(supabase, id, input, actor);

    const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
    return c.json(response, 200);
  },
);

// ─── POST /repairs/:id/parts ───────────────────────────────────────
repairRoutes.post(
  '/:id/parts',
  requirePermission('repairs.edit'),
  zValidator('json', addRepairPartSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const repair = await addPart(supabase, id, input, actor);

    const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
    return c.json(response, 200);
  },
);

// ─── DELETE /repairs/:id/parts/:partId ─────────────────────────────
repairRoutes.delete('/:id/parts/:partId', requirePermission('repairs.edit'), async (c) => {
  const id = c.req.param('id');
  const partId = c.req.param('partId');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const repair = await removePart(supabase, id, partId, actor);

  const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
  return c.json(response, 200);
});

// ─── POST /repairs/:id/deliver ─────────────────────────────────────
repairRoutes.post(
  '/:id/deliver',
  requirePermission('repairs.deliver'),
  zValidator('json', deliverRepairSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const repair = await deliverRepair(supabase, id, input, actor);

    const response: ApiResponse<RepairWithDetails> = { success: true, data: repair };
    return c.json(response, 200);
  },
);

// ─── Public tracking (no auth) ─────────────────────────────────────
// This endpoint is mounted separately without authMiddleware.
export const repairTrackingRoutes = new Hono<AppContext>();

repairTrackingRoutes.get('/track/:ticketNo', async (c) => {
  const ticketNo = c.req.param('ticketNo');
  const supabase = getReqSupabase(c);
  const info = await getTrackingInfo(supabase, ticketNo);

  const response: ApiResponse<RepairTrackingInfo> = { success: true, data: info };
  return c.json(response, 200);
});
