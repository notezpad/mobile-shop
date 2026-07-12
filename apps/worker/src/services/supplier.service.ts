/**
 * Supplier service — CRUD + balance management.
 *
 * Balance logic (mirrors customer but reversed):
 *  - balance > 0  → we owe supplier
 *  - balance < 0  → supplier owes us (advance payment)
 *  - balance = 0  → settled
 */
import {
  AppError,
  ERROR_CODES,
  type Supplier,
  type PaginatedResult,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type SupplierQuery,
  type AdjustSupplierBalanceInput,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'suppliers';

export async function listSuppliers(
  supabase: LooseSupabaseClient,
  query: SupplierQuery,
): Promise<PaginatedResult<Supplier>> {
  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`name.ilike.%${query.search}%,phone.ilike.%${query.search}%,code.ilike.%${query.search}%`);
  }
  if (query.isActive !== undefined) q = q.eq('is_active', query.isActive === 'true');
  if (query.hasBalance === 'true') q = q.neq('balance', 0);
  if (query.hasBalance === 'false') q = q.eq('balance', 0);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'name': return 'name';
      case 'code': return 'code';
      case 'balance': return 'balance';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as Supplier[];
  const total = count ?? 0;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

export async function getSupplier(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<Supplier> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'المورد غير موجود');

  return data as Supplier;
}

export async function createSupplier(
  supabase: LooseSupabaseClient,
  input: CreateSupplierInput,
  actor: AccessTokenUser,
): Promise<Supplier> {
  // Check unique code.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('code', input.code)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'كود المورد مستخدم بالفعل');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: supplier, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      name: input.name,
      code: input.code,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      balance: 0,
      notes: input.notes ?? null,
      is_active: input.isActive,
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
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'الكود مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: supplier as unknown as Record<string, unknown>,
  });

  return supplier as Supplier;
}

export async function updateSupplier(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateSupplierInput,
  actor: AccessTokenUser,
): Promise<Supplier> {
  const existing = await getSupplier(supabase, id);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.code !== undefined) updates.code = input.code;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.email !== undefined) updates.email = input.email;
  if (input.address !== undefined) updates.address = input.address;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'الكود مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return updated as Supplier;
}

export async function deleteSupplier(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const supplier = await getSupplier(supabase, id);

  if (supplier.balance !== 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن حذف مورد برصيد معلّق (${supplier.balance}). سوّي الرصيد أولاً.`,
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      deleted_at: now,
      is_active: false,
      updated_at: now,
      updated_by: actor.id,
    })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'delete',
    entity: TABLE,
    entityId: id,
    before: supplier as unknown as Record<string, unknown>,
  });
}

export async function adjustSupplierBalance(
  supabase: LooseSupabaseClient,
  id: string,
  input: AdjustSupplierBalanceInput,
  actor: AccessTokenUser,
): Promise<Supplier> {
  const supplier = await getSupplier(supabase, id);
  const newBalance = supplier.balance + input.amount;

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    before: { balance: supplier.balance },
    after: { balance: newBalance, adjustment: input.amount, reason: input.reason },
  });

  return updated as Supplier;
}
