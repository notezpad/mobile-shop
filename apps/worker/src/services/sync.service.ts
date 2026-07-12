/**
 * Sync service — pull/push changes between client and server.
 *
 * Pull: returns rows changed since lastSyncAt for the tenant.
 * Push: applies client-side pending writes with conflict resolution.
 *
 * Conflict resolution: last_write_wins by revision number.
 */
import {
  AppError, ERROR_CODES,
  type PullChangesInput, type PullChangesResponse,
  type PushChangesInput, type PushChangesResponse,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

/** Tables that support sync (must have tenant_id + updated_at + deleted_at + revision). */
const SYNCABLE_TABLES = [
  'customers', 'products', 'categories', 'device_units', 'suppliers',
  'sales', 'sale_items', 'returns', 'return_items',
  'repairs', 'repair_status_history', 'repair_parts',
  'inventory_stocks', 'stock_movements',
  'cashboxes', 'cashbox_transactions', 'expenses', 'revenues',
  'payment_methods', 'shifts', 'employees',
  'branches', 'settings',
];

/** Pull changes since lastSyncAt. */
export async function pullChanges(
  supabase: LooseSupabaseClient,
  tenantId: string,
  input: PullChangesInput,
  actor: AccessTokenUser,
): Promise<PullChangesResponse> {
  const tables = input.tables ?? SYNCABLE_TABLES;
  const lastSync = input.lastSyncAt ?? new Date(0).toISOString();
  const result: PullChangesResponse = {
    tables: [],
    serverTime: new Date().toISOString(),
    hasMore: false,
  };

  for (const table of tables) {
    if (!SYNCABLE_TABLES.includes(table)) continue;

    // Pull updated/created rows.
    let q = supabase
      .from(table)
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('updated_at', lastSync)
      .order('updated_at', { ascending: true })
      .limit(500);

    const { data: rows, error } = await q;
    if (error) {
      console.error(`Sync pull error on ${table}:`, error);
      continue;
    }

    // Pull deleted rows (soft-deleted since lastSync).
    const { data: deletedRows } = await supabase
      .from(table)
      .select('id')
      .eq('tenant_id', tenantId)
      .not('deleted_at', 'is', null)
      .gte('deleted_at', lastSync);

    result.tables.push({
      table,
      rows: (rows ?? []) as Record<string, unknown>[],
      deleted: (deletedRows ?? []).map((r: { id: string }) => r.id),
    });
  }

  // Log sync.
  await logSync(supabase, tenantId, actor.id, 'pull', 'success', result.tables.length, result.tables.reduce((s, t) => s + t.rows.length, 0), 0, 0);

  return result;
}

/** Push pending client writes. */
export async function pushChanges(
  supabase: LooseSupabaseClient,
  tenantId: string,
  input: PushChangesInput,
  actor: AccessTokenUser,
): Promise<PushChangesResponse> {
  const response: PushChangesResponse = {
    applied: 0,
    conflicts: [],
    errors: [],
  };

  // Group changes by table for efficient processing.
  const byTable = new Map<string, typeof input.changes>();
  input.changes.forEach((change, idx) => {
    const arr = byTable.get(change.table) ?? [];
    arr.push(change);
    byTable.set(change.table, arr);
  });

  for (const [table, changes] of byTable) {
    if (!SYNCABLE_TABLES.includes(table)) {
      changes.forEach((_, idx) => {
        response.errors.push({ index: idx, message: `Table ${table} not syncable` });
      });
      continue;
    }

    for (const change of changes) {
      try {
        const rowData = change.data as Record<string, unknown>;
        const rowId = rowData.id as string;
        const rowRevision = (rowData.revision as number) ?? 1;

        if (change.operation === 'delete') {
          // Soft delete on server.
          const { error } = await supabase
            .from(table)
            .update({
              deleted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              sync_status: 'synced',
            })
            .eq('id', rowId)
            .eq('tenant_id', tenantId)
            .lt('revision', rowRevision); // only if server revision is older

          if (error) {
            response.errors.push({ index: input.changes.indexOf(change), message: error.message });
          } else {
            response.applied += 1;
          }
        } else {
          // Create or update.
          // Ensure tenant_id is set.
          rowData.tenant_id = tenantId;

          // Check for conflict (existing revision).
          const { data: existing } = await supabase
            .from(table)
            .select('revision')
            .eq('id', rowId)
            .maybeSingle();

          const existingRevision = (existing as { revision?: number } | null)?.revision;

          if (existingRevision !== undefined && existingRevision !== null && rowRevision <= existingRevision) {
            // Conflict: server has newer data.
            const { data: serverRow } = await supabase.from(table).select('*').eq('id', rowId).maybeSingle();
            response.conflicts.push({
              table,
              id: rowId,
              reason: 'stale_revision',
              serverData: (serverRow as Record<string, unknown>) ?? null,
            });
            continue;
          }

          // Upsert.
          const { error } = await supabase
            .from(table)
            .upsert(rowData)
            .eq('id', rowId);

          if (error) {
            if (error.code === '23505') {
              response.conflicts.push({ table, id: rowId, reason: 'validation_error', serverData: null });
            } else {
              response.errors.push({ index: input.changes.indexOf(change), message: error.message });
            }
          } else {
            response.applied += 1;
          }
        }
      } catch (err) {
        response.errors.push({
          index: input.changes.indexOf(change),
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  // Log sync.
  const status = response.errors.length > 0 || response.conflicts.length > 0 ? 'partial' : 'success';
  await logSync(supabase, tenantId, actor.id, 'push', status, byTable.size, 0, response.applied, response.conflicts.length);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: 'sync',
    entityId: null,
    after: { applied: response.applied, conflicts: response.conflicts.length, errors: response.errors.length },
  });

  return response;
}

/** Helper: log sync operation. */
async function logSync(
  supabase: LooseSupabaseClient,
  tenantId: string,
  userId: string,
  direction: 'pull' | 'push',
  status: 'success' | 'partial' | 'failed',
  tablesSynced: number,
  rowsPulled: number,
  rowsPushed: number,
  conflicts: number,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabase.from('sync_logs').insert({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      direction,
      status,
      tables_synced: tablesSynced,
      rows_pulled: rowsPulled,
      rows_pushed: rowsPushed,
      conflicts,
      error_message: null,
      started_at: now,
      completed_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    });
  } catch (err) {
    console.error('Failed to log sync:', err);
  }
}
