/**
 * Backup service — export all tables to JSON, store in Supabase Storage,
 * restore from JSON file.
 *
 * Tables backed up (in dependency order):
 *  roles, permissions, role_permissions, users, branches, settings,
 *  categories, products, device_units, suppliers, inventory_stocks,
 *  customers, sales, sale_items, invoices, invoice_payments,
 *  returns, return_items, repairs, repair_status_history, repair_parts,
 *  cashboxes, cashbox_transactions, expense_categories, expenses,
 *  revenue_categories, revenues, payment_methods, shifts, employees, attendance
 */
import { AppError, ERROR_CODES } from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const BACKUP_TABLE = 'backups';
const BACKUP_BUCKET = 'public-assets';
const BACKUP_FOLDER = 'backups';

const TABLES_TO_EXPORT = [
  'roles', 'permissions', 'role_permissions', 'users', 'branches', 'settings',
  'categories', 'products', 'device_units', 'suppliers',
  'inventory_stocks', 'stock_movements', 'stock_transfers', 'stock_transfer_items',
  'customers', 'sales', 'sale_items', 'invoices', 'invoice_payments',
  'returns', 'return_items',
  'repairs', 'repair_status_history', 'repair_parts',
  'cashboxes', 'cashbox_transactions', 'expense_categories', 'expenses',
  'revenue_categories', 'revenues', 'payment_methods',
  'shifts', 'employees', 'attendance',
  'audit_logs',
];

interface BackupRecord {
  id: string;
  filename: string;
  size: number;
  type: 'manual' | 'auto';
  status: 'completed' | 'failed' | 'restoring';
  created_by: string | null;
  created_at: string;
}

/** Create a backup — exports all tables to JSON, stores in Supabase Storage. */
export async function createBackup(
  supabase: LooseSupabaseClient,
  actor: AccessTokenUser,
  type: 'manual' | 'auto' = 'manual',
  tenantId?: string,
): Promise<BackupRecord> {
  const backupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const filename = `backup-${now.replace(/[:.]/g, '-')}.json`;
  const path = `${BACKUP_FOLDER}/${backupId}.json`;

  // Export all tables.
  const data: Record<string, unknown[]> = {};
  let totalRows = 0;

  for (const table of TABLES_TO_EXPORT) {
    let q = supabase.from(table).select('*').is('deleted_at', null);
    // Filter by tenant_id for tenant-scoped tables (SaaS isolation).
    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    }
    const { data: rows, error } = await q;
    if (error) {
      console.error(`Backup: failed to export ${table}:`, error);
      data[table] = [];
    } else {
      data[table] = rows ?? [];
      totalRows += (rows ?? []).length;
    }
  }

  const backupPayload = {
    metadata: {
      version: '1.0',
      createdAt: now,
      createdBy: actor.id,
      type,
      totalTables: TABLES_TO_EXPORT.length,
      totalRows,
    },
    data,
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);
  const size = new Blob([jsonStr]).size;

  // Upload to Supabase Storage.
  const { error: uploadErr } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(path, new TextEncoder().encode(jsonStr), {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadErr) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `فشل رفع النسخة الاحتياطية: ${uploadErr.message}`);
  }

  // Insert backup record.
  const { data: record, error: recordErr } = await supabase
    .from(BACKUP_TABLE)
    .insert({
      id: backupId,
      filename,
      size,
      type,
      status: 'completed',
      created_by: actor.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (recordErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, recordErr.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: BACKUP_TABLE,
    entityId: backupId,
    after: { filename, size, totalRows, type },
  });

  return record as unknown as BackupRecord;
}

/** List all backups. */
export async function listBackups(
  supabase: LooseSupabaseClient,
): Promise<BackupRecord[]> {
  const { data, error } = await supabase
    .from(BACKUP_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as unknown as BackupRecord[];
}

/** Download a backup — returns the JSON content. */
export async function downloadBackup(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<{ filename: string; content: string; size: number }> {
  const { data: record, error } = await supabase
    .from(BACKUP_TABLE)
    .select('id, filename, size')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !record) throw new AppError(ERROR_CODES.NOT_FOUND, 'النسخة الاحتياطية غير موجودة');

  const path = `${BACKUP_FOLDER}/${id}.json`;
  const { data: fileData, error: dlErr } = await supabase.storage
    .from(BACKUP_BUCKET)
    .download(path);
  if (dlErr || !fileData) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'فشل تحميل ملف النسخة الاحتياطية');
  }

  const content = await fileData.text();
  return {
    filename: (record as { filename: string }).filename,
    content,
    size: (record as { size: number }).size,
  };
}

/** Restore from a backup — replaces all current data with backup data. */
export async function restoreBackup(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<{ restoredTables: number; restoredRows: number }> {
  // Mark backup as restoring.
  await supabase
    .from(BACKUP_TABLE)
    .update({ status: 'restoring', updated_at: new Date().toISOString() })
    .eq('id', id);

  // Download backup content.
  const { content } = await downloadBackup(supabase, id);
  const backup = JSON.parse(content) as {
    metadata: { version: string; totalTables: number; totalRows: number };
    data: Record<string, unknown[]>;
  };

  let restoredTables = 0;
  let restoredRows = 0;

  // Restore each table (upsert by id).
  // Order: same as export (parent tables first).
  for (const table of TABLES_TO_EXPORT) {
    const rows = backup.data[table];
    if (!rows || rows.length === 0) continue;

    // Clear existing non-deleted rows (soft delete them first).
    await supabase.from(table).update({ deleted_at: new Date().toISOString() }).is('deleted_at', null);

    // Insert backup rows.
    const { error: insertErr } = await supabase.from(table).insert(rows);
    if (insertErr) {
      console.error(`Restore: failed to insert ${table}:`, insertErr);
      continue;
    }
    restoredTables += 1;
    restoredRows += rows.length;
  }

  // Mark backup as completed.
  await supabase
    .from(BACKUP_TABLE)
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', id);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: BACKUP_TABLE,
    entityId: id,
    after: { action: 'restore', restoredTables, restoredRows },
  });

  return { restoredTables, restoredRows };
}

/** Delete a backup (soft delete record + remove file from storage). */
export async function deleteBackup(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const path = `${BACKUP_FOLDER}/${id}.json`;

  // Remove from storage.
  await supabase.storage.from(BACKUP_BUCKET).remove([path]);

  // Soft delete record.
  const { error } = await supabase
    .from(BACKUP_TABLE)
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'delete',
    entity: BACKUP_TABLE,
    entityId: id,
  });
}
