/**
 * Audit log + Notification services.
 */
import {
  AppError, ERROR_CODES,
  type PaginatedResult,
  type AuditLogQuery, type AuditLogWithUser,
  type NotificationQuery, type Notification,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import type { AccessTokenUser } from './auth.service';

const AUDIT_TABLE = 'audit_logs';
const NOTIF_TABLE = 'notifications';

// ─── AUDIT LOGS ───────────────────────────────────────────────────

export async function listAuditLogs(
  supabase: LooseSupabaseClient,
  query: AuditLogQuery,
): Promise<PaginatedResult<AuditLogWithUser>> {
  let q = supabase
    .from('v_audit_logs_with_users')
    .select('*', { count: 'exact' });

  if (query.userId) q = q.eq('user_id', query.userId);
  if (query.entity) q = q.eq('entity', query.entity);
  if (query.action) q = q.eq('action', query.action);
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);
  if (query.search) {
    q = q.or(`entity.ilike.%${query.search}%,user_name.ilike.%${query.search}%`);
  }

  const sortColumn = query.sortBy === 'entity' ? 'entity' : query.sortBy === 'action' ? 'action' : 'created_at';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as unknown as AuditLogWithUser[],
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────

/** Generate notifications based on current system state (called by a cron or manually). */
export async function generateSystemNotifications(
  supabase: LooseSupabaseClient,
  tenantId?: string,
): Promise<{ generated: number }> {
  let generated = 0;
  const now = new Date().toISOString();

  // 1. Low-stock notifications — scoped to tenant if provided.
  let lowStockQ = supabase
    .from('v_inventory_stock_levels')
    .select('product_name, product_sku, branch_id, available_quantity, min_quantity')
    .eq('is_low_stock', true)
    .limit(50);
  if (tenantId) lowStockQ = lowStockQ.eq('tenant_id', tenantId);
  const { data: lowStock } = await lowStockQ;

  if (lowStock && lowStock.length > 0) {
    // Get admin/manager users — scoped to tenant.
    let usersQ = supabase
      .from('users')
      .select('id')
      .eq('status', 'active')
      .is('deleted_at', null);
    if (tenantId) usersQ = usersQ.eq('tenant_id', tenantId);
    const { data: users } = await usersQ;

    const userIds = (users ?? []).map((u: { id: string }) => u.id);
    if (userIds.length > 0) {
      const notifs = userIds.map((userId) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'low_stock',
        title: `مخزون منخفض (${lowStock.length} صنف)`,
        message: `يوجد ${lowStock.length} صنف وصل للحد الأدنى. راجع المخزون.`,
        link: '/inventory?lowStock=true',
        is_read: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        revision: 1,
        sync_status: 'synced',
      }));
      await supabase.from(NOTIF_TABLE).insert(notifs).then(() => { generated += notifs.length; }, () => {});
    }
  }

  // 2. Repair ready notifications.
  const { data: readyRepairs } = await supabase
    .from('repairs')
    .select('id, ticket_no, customer_id')
    .eq('status', 'ready')
    .is('deleted_at', null)
    .limit(20);

  if (readyRepairs && readyRepairs.length > 0) {
    const { data: managers } = await supabase
      .from('users')
      .select('id')
      .in('status', ['active'])
      .is('deleted_at', null);
    const managerIds = (managers ?? []).map((u: { id: string }) => u.id);
    if (managerIds.length > 0) {
      const notifs = managerIds.slice(0, 5).map((userId) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        type: 'repair_ready',
        title: `صيانة جاهزة للاستلام (${readyRepairs.length} تذكرة)`,
        message: `يوجد ${readyRepairs.length} جهاز جاهز للاستلام.`,
        link: '/repairs?status=ready',
        is_read: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        revision: 1,
        sync_status: 'synced',
      }));
      await supabase.from(NOTIF_TABLE).insert(notifs).then(() => { generated += notifs.length; }, () => {});
    }
  }

  return { generated };
}

/** List notifications for the current user. */
export async function listNotifications(
  supabase: LooseSupabaseClient,
  userId: string,
  query: NotificationQuery,
): Promise<PaginatedResult<Notification>> {
  let q = supabase
    .from(NOTIF_TABLE)
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (query.unreadOnly === 'true') q = q.eq('is_read', false);

  q = q.order('created_at', { ascending: false });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as Notification[],
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

/** Get unread notification count. */
export async function getUnreadCount(
  supabase: LooseSupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(NOTIF_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('deleted_at', null);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return count ?? 0;
}

/** Mark a notification as read — with ownership check. */
export async function markAsRead(
  supabase: LooseSupabaseClient,
  id: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from(NOTIF_TABLE)
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId); // ownership check — only the owner can mark as read
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
}

/** Mark all notifications as read for a user. */
export async function markAllAsRead(
  supabase: LooseSupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from(NOTIF_TABLE)
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
    .is('deleted_at', null);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
}

