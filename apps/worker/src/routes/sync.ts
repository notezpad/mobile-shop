import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  AppError,
  ERROR_CODES,
  pullChangesSchema,
  pushChangesSchema,
  type PullChangesResponse,
  type PushChangesResponse,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { pullChanges, pushChanges } from '../services/sync.service';

export const syncRoutes = new Hono<AppContext>();

syncRoutes.use('*', authMiddleware);

// ─── POST /sync/pull ──────────────────────────────────────────────
syncRoutes.post(
  '/pull',
  zValidator('json', pullChangesSchema.optional()),
  async (c) => {
    const input = c.req.valid('json') ?? {};
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);

    if (!actor.tenantId) {
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يوجد tenant مرتبط بالجلسة');
    }

    const result = await pullChanges(supabase, actor.tenantId, input, actor);
    const response: ApiResponse<PullChangesResponse> = { success: true, data: result };
    return c.json(response, 200);
  },
);

// ─── POST /sync/push ──────────────────────────────────────────────
syncRoutes.post(
  '/push',
  zValidator('json', pushChangesSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);

    if (!actor.tenantId) {
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يوجد tenant مرتبط بالجلسة');
    }

    const result = await pushChanges(supabase, actor.tenantId, input, actor);
    const response: ApiResponse<PushChangesResponse> = { success: true, data: result };
    return c.json(response, 200);
  },
);

// ─── POST /sync/full ──────────────────────────────────────────────
syncRoutes.post(
  '/full',
  zValidator('json', pullChangesSchema.optional()),
  async (c) => {
    const input = c.req.valid('json') ?? {};
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);

    if (!actor.tenantId) {
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يوجد tenant مرتبط بالجلسة');
    }

    const pullResult = await pullChanges(supabase, actor.tenantId, input, actor);
    const response: ApiResponse<{ pull: PullChangesResponse }> = {
      success: true,
      data: { pull: pullResult },
    };
    return c.json(response, 200);
  },
);
