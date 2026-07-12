import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type DeviceUnit,
  type PaginatedResult,
  type BatchImportResult,
  createDeviceUnitSchema,
  batchCreateDeviceUnitsSchema,
  updateDeviceUnitSchema,
  deviceUnitQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  batchCreateDeviceUnits,
  createDeviceUnit,
  deleteDeviceUnit,
  findByImei,
  getDeviceUnit,
  listDeviceUnits,
  updateDeviceUnit,
} from '../services/device.service';

export const deviceRoutes = new Hono<AppContext>();

deviceRoutes.use('*', authMiddleware);

// ─── GET /devices ──────────────────────────────────────────────────
deviceRoutes.get(
  '/',
  requirePermission('catalog.devices.view'),
  zValidator('query', deviceUnitQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listDeviceUnits(supabase, query);

    const response: ApiResponse<PaginatedResult<DeviceUnit>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /devices/imei/:imei ───────────────────────────────────────
// POS scanner lookup — find device by IMEI.
deviceRoutes.get('/imei/:imei', requirePermission('catalog.devices.view'), async (c) => {
  const imei = c.req.param('imei');
  const supabase = getReqSupabase(c);
  const unit = await findByImei(supabase, imei);

  const response: ApiResponse<DeviceUnit> = { success: true, data: unit };
  return c.json(response, 200);
});

// ─── GET /devices/:id ──────────────────────────────────────────────
deviceRoutes.get('/:id', requirePermission('catalog.devices.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const unit = await getDeviceUnit(supabase, id);

  const response: ApiResponse<DeviceUnit> = { success: true, data: unit };
  return c.json(response, 200);
});

// ─── POST /devices ─────────────────────────────────────────────────
deviceRoutes.post(
  '/',
  requirePermission('catalog.devices.create'),
  zValidator('json', createDeviceUnitSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const unit = await createDeviceUnit(supabase, input, actor);

    const response: ApiResponse<DeviceUnit> = { success: true, data: unit };
    return c.json(response, 201);
  },
);

// ─── POST /devices/batch ───────────────────────────────────────────
deviceRoutes.post(
  '/batch',
  requirePermission('catalog.devices.create'),
  zValidator('json', batchCreateDeviceUnitsSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const result = await batchCreateDeviceUnits(supabase, input, actor);

    const response: ApiResponse<BatchImportResult> = { success: true, data: result };
    return c.json(response, 201);
  },
);

// ─── PATCH /devices/:id ────────────────────────────────────────────
deviceRoutes.patch(
  '/:id',
  requirePermission('catalog.devices.edit'),
  zValidator('json', updateDeviceUnitSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const unit = await updateDeviceUnit(supabase, id, input, actor);

    const response: ApiResponse<DeviceUnit> = { success: true, data: unit };
    return c.json(response, 200);
  },
);

// ─── DELETE /devices/:id ───────────────────────────────────────────
deviceRoutes.delete('/:id', requirePermission('catalog.devices.delete'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteDeviceUnit(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
