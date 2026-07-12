import { z } from 'zod';
import { uuidSchema } from './common';

// ─── Audit Logs ───────────────────────────────────────────────────

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().optional(),
  userId: uuidSchema.optional(),
  entity: z.string().optional(),
  action: z.enum(['create', 'update', 'delete', 'restore', 'login', 'logout', 'export', 'print']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'entity', 'action']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export interface AuditLogWithUser {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_name?: string | null;
  user_username?: string | null;
}

// ─── Notifications ────────────────────────────────────────────────

export const notificationTypeSchema = z.enum([
  'low_stock',
  'repair_ready',
  'repair_overdue',
  'expense_due',
  'cashbox_open',
  'cashbox_not_closed',
  'system',
]);

export type NotificationType = z.infer<typeof notificationTypeSchema>;

export interface Notification {
  id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export const notificationQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
