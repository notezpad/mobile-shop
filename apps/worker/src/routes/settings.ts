import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type SettingCategory,
  type Setting,
  type UpsertSettingInput,
  batchUpsertSettingsSchema,
  settingsQuerySchema,
  upsertSettingSchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { batchUpsertSettings, listSettings, upsertSetting, seedDefaultsIfMissing } from '../services/setting.service';

/**
 * Settings routes — generic key-value store.
 *
 * Endpoints:
 *  GET    /settings              — List (optional ?category=&branchId=)
 *  POST   /settings              — Upsert single
 *  POST   /settings/batch        — Upsert batch
 *  POST   /settings/seed-defaults — Seed DEFAULT_SETTINGS if missing
 */
export const settingRoutes = new Hono<AppContext>();

settingRoutes.use('*', authMiddleware);

// ─── GET /settings ─────────────────────────────────────────────────
settingRoutes.get(
  '/',
  requirePermission('settings.view'),
  zValidator('query', settingsQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const settings = await listSettings(supabase, {
      category: query.category as SettingCategory | undefined,
      branchId: query.branchId,
    });

    const response: ApiResponse<Setting[]> = { success: true, data: settings };
    return c.json(response, 200);
  },
);

// ─── POST /settings ────────────────────────────────────────────────
settingRoutes.post(
  '/',
  requirePermission('settings.manage'),
  zValidator('json', upsertSettingSchema),
  async (c) => {
    // Cast: Zod v3 marks `value` as optional, but our service requires it.
    const input = c.req.valid('json') as unknown as UpsertSettingInput;
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const setting = await upsertSetting(supabase, input, actor);

    const response: ApiResponse<Setting> = { success: true, data: setting };
    return c.json(response, 200);
  },
);

// ─── POST /settings/batch ──────────────────────────────────────────
settingRoutes.post(
  '/batch',
  requirePermission('settings.manage'),
  zValidator('json', batchUpsertSettingsSchema),
  async (c) => {
    const input = c.req.valid('json') as { settings: UpsertSettingInput[] };
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const settings = await batchUpsertSettings(supabase, input.settings, actor);

    const response: ApiResponse<Setting[]> = { success: true, data: settings };
    return c.json(response, 200);
  },
);

// ─── POST /settings/seed-defaults ──────────────────────────────────
// First-install helper — seeds DEFAULT_SETTINGS if not already present.
settingRoutes.post('/seed-defaults', requirePermission('settings.manage'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const count = await seedDefaultsIfMissing(supabase, actor.id);

  const response: ApiResponse<{ inserted: number }> = {
    success: true,
    data: { inserted: count },
  };
  return c.json(response, 200);
});
