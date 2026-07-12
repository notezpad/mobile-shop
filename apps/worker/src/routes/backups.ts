import { Hono } from 'hono';
import { ApiResponse } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { createBackup, listBackups, downloadBackup, restoreBackup, deleteBackup } from '../services/backup.service';

export const backupRoutes = new Hono<AppContext>();

backupRoutes.use('*', authMiddleware);

// ─── GET /backups ──────────────────────────────────────────────────
backupRoutes.get('/', requirePermission('backup.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const backups = await listBackups(supabase);
  const response: ApiResponse<typeof backups> = { success: true, data: backups };
  return c.json(response, 200);
});

// ─── POST /backups ─────────────────────────────────────────────────
backupRoutes.post('/', requirePermission('backup.create'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const backup = await createBackup(supabase, actor, 'manual', actor.tenantId ?? undefined);
  const response: ApiResponse<typeof backup> = { success: true, data: backup };
  return c.json(response, 201);
});

// ─── GET /backups/:id/download ─────────────────────────────────────
backupRoutes.get('/:id/download', requirePermission('backup.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const result = await downloadBackup(supabase, c.req.param('id'));
  return c.body(result.content, 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${result.filename}"`,
  });
});

// ─── POST /backups/:id/restore ─────────────────────────────────────
backupRoutes.post('/:id/restore', requirePermission('backup.restore'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const result = await restoreBackup(supabase, c.req.param('id'), actor);
  const response: ApiResponse<typeof result> = { success: true, data: result };
  return c.json(response, 200);
});

// ─── DELETE /backups/:id ───────────────────────────────────────────
backupRoutes.delete('/:id', requirePermission('backup.create'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteBackup(supabase, c.req.param('id'), actor);
  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
