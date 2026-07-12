/**
 * Customer service — CRUD + balance management + transaction history.
 *
 * Balance logic:
 *  - balance > 0  → customer owes us (debtor)
 *  - balance < 0  → we owe customer (creditor / advance payment)
 *  - balance = 0  → settled
 *
 * Transactions are derived from sales, returns, repairs, and manual adjustments.
 * Each transaction records amount (signed) + balance_after.
 */
import {
  AppError,
  ERROR_CODES,
  type Customer,
  type PaginatedResult,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CustomerQuery,
  type CustomerTransaction,
  type AdjustCustomerBalanceInput,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'customers';

/** List customers with filters + pagination. */
export async function listCustomers(
  supabase: LooseSupabaseClient,
  query: CustomerQuery,
): Promise<PaginatedResult<Customer>> {
  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`name.ilike.%${query.search}%,phone.ilike.%${query.search}%,code.ilike.%${query.search}%,email.ilike.%${query.search}%`);
  }
  if (query.isActive !== undefined) q = q.eq('is_active', query.isActive === 'true');
  if (query.hasBalance === 'true') q = q.neq('balance', 0);
  if (query.hasBalance === 'false') q = q.eq('balance', 0);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'name': return 'name';
      case 'code': return 'code';
      case 'phone': return 'phone';
      case 'balance': return 'balance';
      case 'totalPurchases': return 'total_purchases';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as Customer[];
  const total = count ?? 0;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Get a single customer. */
export async function getCustomer(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<Customer> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'العميل غير موجود');

  return data as Customer;
}

/** Create a new customer. Auto-generates code if not provided. */
export async function createCustomer(
  supabase: LooseSupabaseClient,
  input: CreateCustomerInput,
  actor: AccessTokenUser,
): Promise<Customer> {
  // Check unique phone if provided.
  if (input.phone) {
    const { data: existing } = await supabase
      .from(TABLE)
      .select('id')
      .eq('phone', input.phone)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'رقم الهاتف مستخدم لعميل آخر');
    }
  }

  // Auto-generate code if not provided.
  let code = input.code ?? null;
  if (!code) {
    const { count } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    code = `C-${String((count ?? 0) + 1).padStart(5, '0')}`;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: customer, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      name: input.name,
      code,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      tax_number: input.taxNumber ?? null,
      balance: 0,
      credit_limit: input.creditLimit,
      notes: input.notes ?? null,
      is_active: input.isActive,
      total_purchases: 0,
      total_repairs: 0,
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
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'الكود أو الهاتف مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: customer as unknown as Record<string, unknown>,
  });

  return customer as Customer;
}

/** Update a customer. */
export async function updateCustomer(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateCustomerInput,
  actor: AccessTokenUser,
): Promise<Customer> {
  const existing = await getCustomer(supabase, id);

  // Check unique phone if changed.
  if (input.phone && input.phone !== existing.phone) {
    const { data: existingPhone } = await supabase
      .from(TABLE)
      .select('id')
      .eq('phone', input.phone)
      .neq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingPhone) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'رقم الهاتف مستخدم لعميل آخر');
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.code !== undefined) updates.code = input.code;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.email !== undefined) updates.email = input.email;
  if (input.address !== undefined) updates.address = input.address;
  if (input.taxNumber !== undefined) updates.tax_number = input.taxNumber;
  if (input.creditLimit !== undefined) updates.credit_limit = input.creditLimit;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return updated as Customer;
}

/** Soft-delete a customer. Block if has outstanding balance. */
export async function deleteCustomer(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const customer = await getCustomer(supabase, id);

  if (customer.balance !== 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن حذف عميل برصيد معلّق (${customer.balance}). سوّي الرصيد أولاً.`,
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
    before: customer as unknown as Record<string, unknown>,
  });
}

/** Manual balance adjustment (credit/debit). */
export async function adjustBalance(
  supabase: LooseSupabaseClient,
  id: string,
  input: AdjustCustomerBalanceInput,
  actor: AccessTokenUser,
): Promise<Customer> {
  const customer = await getCustomer(supabase, id);

  // positive amount → customer owes more (debit)
  // negative amount → customer paid / we credit (credit)
  const newBalance = customer.balance + input.amount;

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
    before: { balance: customer.balance },
    after: { balance: newBalance, adjustment: input.amount, reason: input.reason },
  });

  return updated as Customer;
}

/** Get customer transaction history (derived from sales, returns, repairs, adjustments). */
export async function getTransactionHistory(
  supabase: LooseSupabaseClient,
  customerId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<CustomerTransaction>> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  // Use the v_customer_transactions view (migration 0006).
  const { data, error, count } = await supabase
    .from('v_customer_transactions')
    .select('*', { count: 'exact' })
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as unknown as CustomerTransaction[];
  const total = count ?? 0;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Get customer summary stats. */
export async function getCustomerStats(
  supabase: LooseSupabaseClient,
  customerId: string,
): Promise<{
  totalPurchases: number;
  totalRepairs: number;
  outstandingBalance: number;
  lastPurchaseAt: string | null;
  lastRepairAt: string | null;
}> {
  const customer = await getCustomer(supabase, customerId);
  return {
    totalPurchases: customer.total_purchases,
    totalRepairs: customer.total_repairs,
    outstandingBalance: customer.balance,
    lastPurchaseAt: null, // computed in view
    lastRepairAt: null,
  };
}
