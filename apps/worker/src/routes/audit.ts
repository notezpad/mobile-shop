import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse, type PaginatedResult,
  type AuditLogWithUser, type Notification,
  auditLogQuerySchema, notificationQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { listAuditLogs } from '../services/notification.service';
import {
  generateSystemNotifications, listNotifications, getUnreadCount, markAsRead, markAllAsRead,
} from '../services/notification.service';

// ─── Audit log routes ─────────────────────────────────────────────

export const auditLogRoutes = new Hono<AppContext>();
auditLogRoutes.use('*', authMiddleware);

auditLogRoutes.get(
  '/',
  requirePermission('audit_logs.view'),
  zValidator('query', auditLogQuerySchema),
  async (c) => {
    const supabase = getReqSupabase(c);
    const result = await listAuditLogs(supabase, c.req.valid('query'));
    const response: ApiResponse<PaginatedResult<AuditLogWithUser>> = {
      success: true, data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── Notification routes ──────────────────────────────────────────

export const notificationRoutes = new Hono<AppContext>();
notificationRoutes.use('*', authMiddleware);

notificationRoutes.get('/', async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const query = c.req.query();
  const result = await listNotifications(supabase, actor.id, {
    page: Number(query.page ?? '1'),
    pageSize: Number(query.pageSize ?? '20'),
    unreadOnly: query.unreadOnly as 'true' | 'false' | undefined,
  });
  const response: ApiResponse<PaginatedResult<Notification>> = {
    success: true, data: result,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total },
  };
  return c.json(response, 200);
});

notificationRoutes.get('/unread-count', async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const count = await getUnreadCount(supabase, actor.id);
  const response: ApiResponse<{ count: number }> = { success: true, data: { count } };
  return c.json(response, 200);
});

notificationRoutes.post('/generate', requirePermission('settings.manage'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const result = await generateSystemNotifications(supabase, actor.tenantId ?? undefined);
  const response: ApiResponse<typeof result> = { success: true, data: result };
  return c.json(response, 200);
});

notificationRoutes.post('/:id/read', async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await markAsRead(supabase, c.req.param('id'), actor.id);
  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});

notificationRoutes.post('/read-all', async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await markAllAsRead(supabase, actor.id);
  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
