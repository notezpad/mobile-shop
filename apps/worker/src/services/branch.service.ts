/**
 * Branch service — CRUD + activate/deactivate + set-main.
 *
 * Business rules:
 *  - Only one main branch can exist. Setting a new main demotes the previous.
 *  - Cannot delete the main branch (must reassign first).
 *  - Cannot deactivate a branch that has users assigned (soft-block).
 *  - Branch code is unique across the system.
 */
import {
  AppError,
  ERROR_CODES,
  type Branch,
  type PaginatedResult,
  type CreateBranchInput,
  type UpdateBranchInput,
  type BranchQuery,
  type BranchSettings,
  DEFAULT_BRANCH_SETTINGS,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'branches';

/** List branches with filters + pagination. */
export async function listBranches(
  supabase: LooseSupabaseClient,
  query: BranchQuery,
): Promise<PaginatedResult<Branch>> {
  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`name.ilike.%${query.search}%,code.ilike.%${query.search}%,phone.ilike.%${query.search}%`);
  }
  if (query.isActive !== undefined) {
    q = q.eq('is_active', query.isActive === 'true');
  }

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'name': return 'name';
      case 'code': return 'code';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const branches = (data ?? []) as Branch[];
  const total = count ?? 0;

  return {
    items: branches,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Get all branches for dropdowns (lightweight, no pagination). */
export async function listActiveBranches(
  supabase: LooseSupabaseClient,
): Promise<Branch[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('is_main', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as Branch[];
}

/** Get a single branch by ID. */
export async function getBranch(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<Branch> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'الفرع غير موجود');

  return data as Branch;
}

/** Create a new branch. */
export async function createBranch(
  supabase: LooseSupabaseClient,
  input: CreateBranchInput,
  actor: AccessTokenUser,
): Promise<Branch> {
  // Check unique code.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('code', input.code)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'كود الفرع مستخدم بالفعل');
  }

  // If setting as main, demote any existing main first.
  if (input.isMain) {
    await demoteExistingMain(supabase, actor);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const settings: BranchSettings = {
    ...DEFAULT_BRANCH_SETTINGS,
    ...(input.settings ?? {}),
  } as BranchSettings;

  const { data: branch, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      name: input.name,
      code: input.code,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      is_main: input.isMain ?? false,
      is_active: input.isActive ?? true,
      settings,
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

  if (error) {
    if (error.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'القيمة مكررة');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: sanitizeBranch(branch as Branch),
  });

  return branch as Branch;
}

/** Update a branch. */
export async function updateBranch(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateBranchInput,
  actor: AccessTokenUser,
): Promise<Branch> {
  const existing = await getBranch(supabase, id);

  // If promoting to main, demote any existing main first.
  if (input.isMain && !existing.is_main) {
    await demoteExistingMain(supabase, actor, id);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.code !== undefined) updates.code = input.code;
  if (input.address !== undefined) updates.address = input.address;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.email !== undefined) updates.email = input.email;
  if (input.isMain !== undefined) updates.is_main = input.isMain;
  if (input.isActive !== undefined) {
    // Block deactivating a branch with active users.
    if (!input.isActive) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', id)
        .eq('status', 'active')
        .is('deleted_at', null);

      if ((count ?? 0) > 0) {
        throw new AppError(
          ERROR_CODES.BUSINESS_RULE_VIOLATION,
          `لا يمكن إيقاف فرع به ${count} مستخدم نشط. أعد تعيين المستخدمين أولاً.`,
        );
      }
    }
    updates.is_active = input.isActive;
  }
  if (input.settings !== undefined) {
    updates.settings = { ...(existing.settings as BranchSettings), ...input.settings };
  }

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'كود الفرع مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    before: sanitizeBranch(existing),
    after: sanitizeBranch(updated as Branch),
  });

  return updated as Branch;
}

/** Soft-delete a branch. Main branch cannot be deleted. */
export async function deleteBranch(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const branch = await getBranch(supabase, id);

  if (branch.is_main) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'لا يمكن حذف الفرع الرئيسي. عيّن فرعًا آخر كرئيسي أولاً.',
    );
  }

  // Check no users are assigned.
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', id)
    .is('deleted_at', null);

  if ((count ?? 0) > 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن حذف فرع به ${count} مستخدم. أعد تعيين المستخدمين أولاً.`,
    );
  }

  const { error } = await supabase
    .from(TABLE)
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'delete',
    entity: TABLE,
    entityId: id,
    before: sanitizeBranch(branch),
  });
}

/** Demote any existing main branch (excluding the given ID). */
async function demoteExistingMain(
  supabase: LooseSupabaseClient,
  actor: AccessTokenUser,
  excludeId?: string,
): Promise<void> {
  const query = supabase
    .from(TABLE)
    .update({
      is_main: false,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('is_main', true)
    .is('deleted_at', null);

  if (excludeId) {
    void query.neq('id', excludeId);
  }

  const { error } = await query;
  if (error) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }
}

function sanitizeBranch(branch: Branch): Record<string, unknown> {
  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    is_main: branch.is_main,
    is_active: branch.is_active,
  };
}
