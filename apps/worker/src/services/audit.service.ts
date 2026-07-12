/**
 * Audit log writer.
 * Fire-and-forget — never blocks the main operation.
 * Failures are logged but not thrown (audit log must not break business logic).
 */
import type { UUID } from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'login'
  | 'logout'
  | 'export'
  | 'print';

export interface AuditEntry {
  userId: UUID | null;
  action: AuditAction;
  entity: string;
  entityId: UUID | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(
  supabase: LooseSupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
      created_by: entry.userId,
      updated_by: entry.userId,
    });

    if (error) {
      console.error('Failed to write audit log:', error);
    }
  } catch (err) {
    console.error('Audit log exception:', err);
  }
}
