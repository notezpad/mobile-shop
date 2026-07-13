/**
 * Audit + Notifications API + hooks.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@core/db/api-client';
import type { AuditLogWithUser, PaginatedResult, AuditLogQuery, Notification, NotificationQuery } from '@mobile-shop/shared';

export const auditApi = {
  list: (q: AuditLogQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sortBy: q.sortBy, sortDir: q.sortDir });
    if (q.search) p.set('search', q.search);
    if (q.userId) p.set('userId', q.userId);
    if (q.entity) p.set('entity', q.entity);
    if (q.action) p.set('action', q.action);
    if (q.fromDate) p.set('fromDate', q.fromDate);
    if (q.toDate) p.set('toDate', q.toDate);
    return api.get<PaginatedResult<AuditLogWithUser>>(`/audit-logs?${p}`);
  },
};

export const notificationApi = {
  list: (unreadOnly = false) => api.get<PaginatedResult<Notification>>(`/notifications?unreadOnly=${unreadOnly}&pageSize=20`),
  unreadCount: () => api.get<{ count: number }>(`/notifications/unread-count`),
  markRead: (id: string) => api.post<null>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<null>(`/notifications/read-all`, {}),
};

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({ queryKey: ['audit-logs', query], queryFn: () => auditApi.list(query), placeholderData: (prev) => prev });
}

export function useNotifications(unreadOnly = false) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => notificationApi.list(unreadOnly),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationApi.unreadCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}
