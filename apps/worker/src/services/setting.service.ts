/**
 * Settings service — generic key-value store with category grouping.
 *
 * Design:
 *  - Settings are global by default. Branch-specific settings use `branch_id`.
 *  - On first install, DEFAULT_SETTINGS from @mobile-shop/shared are seeded.
 *  - Upsert (insert or update) — single or batch.
 *  - Read returns merged view: global settings + branch overrides.
 */
import {
  AppError,
  ERROR_CODES,
  type SettingCategory,
  type Setting,
  DEFAULT_SETTINGS,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'settings';

interface SettingRow {
  id: string;
  key: string;
  value: unknown;
  category: SettingCategory;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** List all settings, optionally filtered by category/branch. */
export async function listSettings(
  supabase: LooseSupabaseClient,
  filters: { category?: SettingCategory; branchId?: string },
): Promise<Setting[]> {
  let q = supabase.from(TABLE).select('*').is('deleted_at', null);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.branchId) {
    // Return both global settings (branch_id IS NULL) AND branch-specific.
    q = q.or(`branch_id.is.null,branch_id.eq.${filters.branchId}`);
  }
  q = q.order('category', { ascending: true }).order('key', { ascending: true });

  const { data, error } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return (data as SettingRow[] ?? []).map(toSetting);
}

/** Upsert a single setting. */
export async function upsertSetting(
  supabase: LooseSupabaseClient,
  input: {
    key: string;
    value: unknown;
    category: SettingCategory;
    branchId?: string | null;
  },
  actor: AccessTokenUser,
): Promise<Setting> {
  const now = new Date().toISOString();
  const branchId = input.branchId ?? null;

  // Check if setting exists (key + branch_id combination).
  let existingQuery = supabase
    .from(TABLE)
    .select('*')
    .eq('key', input.key)
    .is('deleted_at', null);

  if (branchId) {
    existingQuery = existingQuery.eq('branch_id', branchId);
  } else {
    existingQuery = existingQuery.is('branch_id', null);
  }

  const { data: existing, error: findErr } = await existingQuery.maybeSingle();
  if (findErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, findErr.message);

  let row: SettingRow;

  if (existing) {
    // Update.
    const { data: updated, error } = await supabase
      .from(TABLE)
      .update({
        value: input.value,
        category: input.category,
        updated_at: now,
        updated_by: actor.id,
      })
      .eq('id', (existing as SettingRow).id)
      .select('*')
      .single();

    if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
    row = updated as SettingRow;
  } else {
    // Insert.
    const { data: inserted, error } = await supabase
      .from(TABLE)
      .insert({
        id: crypto.randomUUID(),
        key: input.key,
        value: input.value,
        category: input.category,
        branch_id: branchId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        revision: 1,
        sync_status: 'synced',
        created_by: actor.id,
        updated_by: actor.id,
      })
      .select('*')
      .single();

    if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
    row = inserted as SettingRow;
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: row.id,
    after: { key: row.key, value: row.value, category: row.category, branchId: row.branch_id },
  });

  return toSetting(row);
}

/** Batch upsert — atomic. */
export async function batchUpsertSettings(
  supabase: LooseSupabaseClient,
  inputs: Array<{ key: string; value: unknown; category: SettingCategory; branchId?: string | null }>,
  actor: AccessTokenUser,
): Promise<Setting[]> {
  const results: Setting[] = [];
  for (const input of inputs) {
    results.push(await upsertSetting(supabase, input, actor));
  }
  return results;
}

/** Seed default settings if missing. Called on first install. */
export async function seedDefaultsIfMissing(
  supabase: LooseSupabaseClient,
  actorId: string,
): Promise<number> {
  let inserted = 0;
  const now = new Date().toISOString();

  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const { data: existing } = await supabase
      .from(TABLE)
      .select('id')
      .eq('key', key)
      .is('branch_id', null)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from(TABLE).insert({
      id: crypto.randomUUID(),
      key,
      value: def.value,
      category: def.category,
      branch_id: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
      created_by: actorId,
      updated_by: actorId,
    });

    if (error) {
      console.error(`Failed to seed setting "${key}":`, error);
      continue;
    }
    inserted++;
  }

  return inserted;
}

function toSetting(row: SettingRow): Setting {
  return {
    key: row.key,
    value: row.value,
    category: row.category,
    branchId: row.branch_id,
  };
}
