/**
 * Finance service — cashbox + expenses + revenues + payment methods.
 *
 * Cashbox lifecycle:
 *  open → (transactions accumulate) → close
 *  open → forced_closed (admin override)
 *
 * Each expense/revenue linked to a cashbox records a cashbox_transaction.
 */
import {
  AppError,
  ERROR_CODES,
  type Cashbox,
  type CashboxTransaction,
  type Expense,
  type Revenue,
  type ExpenseCategory,
  type RevenueCategory,
  type PaymentMethod,
  type PaginatedResult,
  type OpenCashboxInput,
  type CloseCashboxInput,
  type CashboxQuery,
  type CreateExpenseInput,
  type UpdateExpenseInput,
  type ExpenseQuery,
  type CreateRevenueInput,
  type UpdateRevenueInput,
  type RevenueQuery,
  type CreateExpenseCategoryInput,
  type CreateRevenueCategoryInput,
  type UpdatePaymentMethodInput,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

// ─── CASHBOX ──────────────────────────────────────────────────────

const CASHBOX_TABLE = 'cashboxes';
const CASHBOX_TXN_TABLE = 'cashbox_transactions';

/** Open a new cashbox for the current user + branch. */
export async function openCashbox(
  supabase: LooseSupabaseClient,
  input: OpenCashboxInput,
  actor: AccessTokenUser,
): Promise<Cashbox> {
  // Check no open cashbox exists for this user+branch.
  const { data: existing } = await supabase
    .from(CASHBOX_TABLE)
    .select('id')
    .eq('branch_id', input.branchId)
    .eq('user_id', actor.id)
    .eq('status', 'open')
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لديك خزنة مفتوحة بالفعل');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: cashbox, error } = await supabase
    .from(CASHBOX_TABLE)
    .insert({
      id,
      branch_id: input.branchId,
      user_id: actor.id,
      opening_balance: input.openingBalance,
      closing_balance: null,
      expected_closing: null,
      variance: null,
      opened_at: now,
      closed_at: null,
      status: 'open',
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  // Record opening balance as a transaction.
  if (input.openingBalance > 0) {
    await supabase.from(CASHBOX_TXN_TABLE).insert({
      id: crypto.randomUUID(),
      cashbox_id: id,
      type: 'in',
      amount: input.openingBalance,
      payment_method: 'cash',
      reason: 'رصيد افتتاحي',
      ref_type: 'cashbox_open',
      ref_id: id,
      user_id: actor.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    });
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: CASHBOX_TABLE,
    entityId: id,
    after: { openingBalance: input.openingBalance, branchId: input.branchId },
  });

  return cashbox as Cashbox;
}

/** Close a cashbox — compute expected closing + variance. */
export async function closeCashbox(
  supabase: LooseSupabaseClient,
  id: string,
  input: CloseCashboxInput,
  actor: AccessTokenUser,
): Promise<Cashbox> {
  const { data: cashbox, error: findErr } = await supabase
    .from(CASHBOX_TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (findErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, findErr.message);
  if (!cashbox) throw new AppError(ERROR_CODES.NOT_FOUND, 'الخزنة غير موجودة');

  const cb = cashbox as Cashbox;
  if (cb.status !== 'open') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'الخزنة ليست مفتوحة');
  }

  // Compute expected closing = opening + sum(in) - sum(out).
  const { data: txns } = await supabase
    .from(CASHBOX_TXN_TABLE)
    .select('type, amount')
    .eq('cashbox_id', id)
    .is('deleted_at', null);
  const txnList = (txns ?? []) as Array<{ type: string; amount: number }>;
  const totalIn = txnList.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const totalOut = txnList.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  const expectedClosing = cb.opening_balance + totalIn - totalOut;
  const variance = input.closingBalance - expectedClosing;

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from(CASHBOX_TABLE)
    .update({
      status: 'closed',
      closing_balance: input.closingBalance,
      expected_closing: expectedClosing,
      variance,
      closed_at: now,
      notes: input.notes ? `${cb.notes ?? ''}\n[إقفال: ${input.notes}]` : cb.notes,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: CASHBOX_TABLE,
    entityId: id,
    before: { status: 'open' },
    after: { status: 'closed', closingBalance: input.closingBalance, expectedClosing, variance },
  });

  return updated as Cashbox;
}

/** Get the current open cashbox for a user. */
export async function getCurrentCashbox(
  supabase: LooseSupabaseClient,
  userId: string,
): Promise<Cashbox | null> {
  const { data, error } = await supabase
    .from(CASHBOX_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .order('opened_at', { ascending: false })
    .maybeSingle();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data as Cashbox) ?? null;
}

/** List cashboxes. */
export async function listCashboxes(
  supabase: LooseSupabaseClient,
  query: CashboxQuery,
): Promise<PaginatedResult<Cashbox>> {
  let q = supabase
    .from(CASHBOX_TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.userId) q = q.eq('user_id', query.userId);
  if (query.status) q = q.eq('status', query.status);
  if (query.fromDate) q = q.gte('opened_at', query.fromDate);
  if (query.toDate) q = q.lte('opened_at', query.toDate);

  const sortColumn = query.sortBy === 'closedAt' ? 'closed_at' : 'opened_at';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as Cashbox[],
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

/** Get cashbox transactions. */
export async function getCashboxTransactions(
  supabase: LooseSupabaseClient,
  cashboxId: string,
): Promise<CashboxTransaction[]> {
  const { data, error } = await supabase
    .from(CASHBOX_TXN_TABLE)
    .select('*')
    .eq('cashbox_id', cashboxId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as CashboxTransaction[];
}

/** Record a cashbox transaction (internal — called by expense/revenue services). */
async function recordCashboxTransaction(
  supabase: LooseSupabaseClient,
  input: {
    cashboxId: string;
    type: 'in' | 'out';
    amount: number;
    paymentMethod: string;
    reason: string;
    refType: string;
    refId: string;
    userId: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from(CASHBOX_TXN_TABLE).insert({
    id: crypto.randomUUID(),
    cashbox_id: input.cashboxId,
    type: input.type,
    amount: input.amount,
    payment_method: input.paymentMethod,
    reason: input.reason,
    ref_type: input.refType,
    ref_id: input.refId,
    user_id: input.userId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
}

// ─── EXPENSES ─────────────────────────────────────────────────────

const EXPENSE_TABLE = 'expenses';
const EXPENSE_CAT_TABLE = 'expense_categories';

export async function listExpenses(
  supabase: LooseSupabaseClient,
  query: ExpenseQuery,
): Promise<PaginatedResult<Expense & { category_name?: string; user_name?: string; branch_name?: string }>> {
  let q = supabase
    .from('v_expenses_list')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.categoryId) q = q.eq('category_id', query.categoryId);
  if (query.paymentMethod) q = q.eq('payment_method', query.paymentMethod);
  if (query.fromDate) q = q.gte('date', query.fromDate);
  if (query.toDate) q = q.lte('date', query.toDate);
  if (query.search) q = q.ilike('note', `%${query.search}%`);

  const sortColumn = query.sortBy === 'amount' ? 'amount' : query.sortBy === 'createdAt' ? 'created_at' : 'date';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as Array<Expense & { category_name?: string; user_name?: string; branch_name?: string }>,
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

export async function createExpense(
  supabase: LooseSupabaseClient,
  input: CreateExpenseInput,
  actor: AccessTokenUser,
): Promise<Expense> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: expense, error } = await supabase
    .from(EXPENSE_TABLE)
    .insert({
      id,
      branch_id: input.branchId,
      category_id: input.categoryId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      date: input.date,
      note: input.note ?? null,
      user_id: actor.id,
      cashbox_id: input.cashboxId ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  // Record cashbox transaction if linked.
  if (input.cashboxId) {
    await recordCashboxTransaction(supabase, {
      cashboxId: input.cashboxId,
      type: 'out',
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      reason: `مصروف: ${input.note ?? ''}`,
      refType: 'expense',
      refId: id,
      userId: actor.id,
    });
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: EXPENSE_TABLE,
    entityId: id,
    after: { amount: input.amount, categoryId: input.categoryId },
  });

  return expense as Expense;
}

export async function updateExpense(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateExpenseInput,
  actor: AccessTokenUser,
): Promise<Expense> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.categoryId !== undefined) updates.category_id = input.categoryId;
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.paymentMethod !== undefined) updates.payment_method = input.paymentMethod;
  if (input.date !== undefined) updates.date = input.date;
  if (input.note !== undefined) updates.note = input.note;

  const { data, error } = await supabase.from(EXPENSE_TABLE).update(updates).eq('id', id).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as Expense;
}

export async function deleteExpense(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from(EXPENSE_TABLE).update({ deleted_at: now, updated_at: now }).eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
}

export async function listExpenseCategories(supabase: LooseSupabaseClient): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from(EXPENSE_CAT_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as ExpenseCategory[];
}

export async function createExpenseCategory(
  supabase: LooseSupabaseClient,
  input: CreateExpenseCategoryInput,
  actor: AccessTokenUser,
): Promise<ExpenseCategory> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(EXPENSE_CAT_TABLE)
    .insert({ id, name: input.name, icon: input.icon ?? null, is_system: false, created_at: now, updated_at: now, deleted_at: null, revision: 1, sync_status: 'synced' })
    .select('*')
    .single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as ExpenseCategory;
}

// ─── REVENUES ─────────────────────────────────────────────────────

const REVENUE_TABLE = 'revenues';
const REVENUE_CAT_TABLE = 'revenue_categories';

export async function listRevenues(
  supabase: LooseSupabaseClient,
  query: RevenueQuery,
): Promise<PaginatedResult<Revenue & { category_name?: string; user_name?: string; branch_name?: string }>> {
  let q = supabase
    .from('v_revenues_list')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.categoryId) q = q.eq('category_id', query.categoryId);
  if (query.paymentMethod) q = q.eq('payment_method', query.paymentMethod);
  if (query.fromDate) q = q.gte('date', query.fromDate);
  if (query.toDate) q = q.lte('date', query.toDate);
  if (query.search) q = q.ilike('note', `%${query.search}%`);

  const sortColumn = query.sortBy === 'amount' ? 'amount' : query.sortBy === 'createdAt' ? 'created_at' : 'date';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as Array<Revenue & { category_name?: string; user_name?: string; branch_name?: string }>,
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

export async function createRevenue(
  supabase: LooseSupabaseClient,
  input: CreateRevenueInput,
  actor: AccessTokenUser,
): Promise<Revenue> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: revenue, error } = await supabase
    .from(REVENUE_TABLE)
    .insert({
      id,
      branch_id: input.branchId,
      category_id: input.categoryId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      date: input.date,
      note: input.note ?? null,
      user_id: actor.id,
      cashbox_id: input.cashboxId ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  if (input.cashboxId) {
    await recordCashboxTransaction(supabase, {
      cashboxId: input.cashboxId,
      type: 'in',
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      reason: `إيراد: ${input.note ?? ''}`,
      refType: 'revenue',
      refId: id,
      userId: actor.id,
    });
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: REVENUE_TABLE,
    entityId: id,
    after: { amount: input.amount, categoryId: input.categoryId },
  });

  return revenue as Revenue;
}

export async function updateRevenue(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateRevenueInput,
  actor: AccessTokenUser,
): Promise<Revenue> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.categoryId !== undefined) updates.category_id = input.categoryId;
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.paymentMethod !== undefined) updates.payment_method = input.paymentMethod;
  if (input.date !== undefined) updates.date = input.date;
  if (input.note !== undefined) updates.note = input.note;

  const { data, error } = await supabase.from(REVENUE_TABLE).update(updates).eq('id', id).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as Revenue;
}

export async function deleteRevenue(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from(REVENUE_TABLE).update({ deleted_at: now, updated_at: now }).eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
}

export async function listRevenueCategories(supabase: LooseSupabaseClient): Promise<RevenueCategory[]> {
  const { data, error } = await supabase
    .from(REVENUE_CAT_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as RevenueCategory[];
}

export async function createRevenueCategory(
  supabase: LooseSupabaseClient,
  input: CreateRevenueCategoryInput,
  actor: AccessTokenUser,
): Promise<RevenueCategory> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(REVENUE_CAT_TABLE)
    .insert({ id, name: input.name, icon: input.icon ?? null, is_system: false, created_at: now, updated_at: now, deleted_at: null, revision: 1, sync_status: 'synced' })
    .select('*')
    .single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as RevenueCategory;
}

// ─── PAYMENT METHODS ──────────────────────────────────────────────

const PM_TABLE = 'payment_methods';

export async function listPaymentMethods(supabase: LooseSupabaseClient): Promise<PaymentMethod[]> {
  const { data, error } = await supabase
    .from(PM_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as PaymentMethod[];
}

export async function updatePaymentMethod(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdatePaymentMethodInput,
): Promise<PaymentMethod> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.nameAr !== undefined) updates.name_ar = input.nameAr;
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;

  const { data, error } = await supabase.from(PM_TABLE).update(updates).eq('id', id).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as PaymentMethod;
}

/** Get finance summary for a branch (dashboard KPIs). */
export async function getFinanceSummary(
  supabase: LooseSupabaseClient,
  branchId?: string,
  fromDate?: string,
  toDate?: string,
): Promise<{
  totalExpenses: number;
  totalRevenues: number;
  netProfit: number;
  expenseCount: number;
  revenueCount: number;
}> {
  let expQuery = supabase.from(EXPENSE_TABLE).select('amount', { count: 'exact', head: false }).is('deleted_at', null);
  let revQuery = supabase.from(REVENUE_TABLE).select('amount', { count: 'exact', head: false }).is('deleted_at', null);

  if (branchId) {
    expQuery = expQuery.eq('branch_id', branchId);
    revQuery = revQuery.eq('branch_id', branchId);
  }
  if (fromDate) {
    expQuery = expQuery.gte('date', fromDate);
    revQuery = revQuery.gte('date', fromDate);
  }
  if (toDate) {
    expQuery = expQuery.lte('date', toDate);
    revQuery = revQuery.lte('date', toDate);
  }

  const [expResult, revResult] = await Promise.all([expQuery, revQuery]);

  const expenses = ((expResult.data ?? []) as Array<{ amount: number }>);
  const revenues = ((revResult.data ?? []) as Array<{ amount: number }>);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenues = revenues.reduce((s, r) => s + r.amount, 0);

  return {
    totalExpenses,
    totalRevenues,
    netProfit: totalRevenues - totalExpenses,
    expenseCount: expResult.count ?? 0,
    revenueCount: revResult.count ?? 0,
  };
}
