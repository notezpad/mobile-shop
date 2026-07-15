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
  type RecordCustomerPaymentInput,
  type CustomerPayment,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import { getCurrentCashbox } from './finance.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'customers';
const PAYMENT_TABLE = 'customer_payments';
const CASHBOX_TXN_TABLE = 'cashbox_transactions';

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

/** Get customer transaction history (derived from sales, returns, repairs, payments, adjustments). */
export async function getTransactionHistory(
  supabase: LooseSupabaseClient,
  customerId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<CustomerTransaction>> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  // Use the v_customer_transactions view (migration 0006 + 0017).
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

/**
 * Record a customer payment — the core "running tab" operation.
 *
 * Flow:
 *  1. Validate customer exists + is active.
 *  2. Validate amount > 0.
 *  3. Find the actor's open cashbox (for the actor's branch).
 *  4. Insert a row in `customer_payments`.
 *  5. Reduce customer.balance by amount (balance can go negative = credit).
 *  6. If payment method is cash-based (cash, vodafone_cash, instapay, fawry),
 *     insert a row in `cashbox_transactions` (type: 'in') so the money
 *     shows up in the cashbox + reports.
 *  7. Audit log.
 *
 * Returns the inserted payment row + updated customer.
 */
export async function recordCustomerPayment(
  supabase: LooseSupabaseClient,
  customerId: string,
  input: RecordCustomerPaymentInput,
  actor: AccessTokenUser,
): Promise<{ payment: CustomerPayment; customer: Customer }> {
  // ─── 1. Validate customer ──────────────────────────────────────────
  const customer = await getCustomer(supabase, customerId);
  if (!customer.is_active) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'العميل موقوف — لا يمكن تسجيل دفعات له');
  }
  if (input.amount <= 0) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'مبلغ الدفعة يجب أن يكون أكبر من صفر');
  }

  // Determine the branch — prefer the actor's branch.
  const branchId = actor.branchId;
  if (!branchId) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'حسابك غير مرتبط بفرع — لا يمكن تسجيل الدفعة');
  }

  // ─── 2. Find the actor's open cashbox ──────────────────────────────
  // We link the payment to the cashbox even if the payment method is not
  // cash — that way the audit trail is complete. Money is only added to
  // the cashbox balance for cash-equivalent methods.
  const cashbox = await getCurrentCashbox(supabase, actor.id);

  const now = new Date().toISOString();
  const paymentId = crypto.randomUUID();
  const paidAt = input.paidAt ?? now;

  // ─── 3. Insert customer_payments row ───────────────────────────────
  const { data: paymentRow, error: payErr } = await supabase
    .from(PAYMENT_TABLE)
    .insert({
      id: paymentId,
      customer_id: customerId,
      branch_id: branchId,
      user_id: actor.id,
      cashbox_id: cashbox?.id ?? null,
      amount: input.amount,
      payment_method: input.paymentMethod,
      reference: input.reference ?? null,
      paid_at: paidAt,
      notes: input.notes ?? null,
      tenant_id: actor.tenantId,
      created_at: now,
      updated_at: now,
      created_by: actor.id,
      updated_by: actor.id,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (payErr) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `فشل تسجيل الدفعة: ${payErr.message}`);
  }

  // ─── 4. Reduce customer balance ────────────────────────────────────
  // balance can go negative — that means we owe the customer (advance payment).
  const newBalance = customer.balance - input.amount;
  const { data: updatedCustomer, error: custErr } = await supabase
    .from(TABLE)
    .update({
      balance: newBalance,
      updated_at: now,
      updated_by: actor.id,
    })
    .eq('id', customerId)
    .select('*')
    .single();

  if (custErr) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, `فشل تحديث رصيد العميل: ${custErr.message}`);
  }

  // ─── 5. Add to cashbox if cash-based method ────────────────────────
  // cash, vodafone_cash, instapay, fawry all represent real money received
  // — they should be reflected in the cashbox balance + reports.
  // 'card' is excluded because card payments go to the bank, not the cashbox.
  const cashBasedMethods = ['cash', 'vodafone_cash', 'instapay', 'fawry'];
  if (cashbox && cashBasedMethods.includes(input.paymentMethod)) {
    const customerName = customer.name;
    const reason = `دفعة من ${customerName}${input.reference ? ` — ${input.reference}` : ''}`;

    const { error: cbErr } = await supabase.from(CASHBOX_TXN_TABLE).insert({
      id: crypto.randomUUID(),
      cashbox_id: cashbox.id,
      type: 'in',
      amount: input.amount,
      payment_method: input.paymentMethod,
      reason,
      ref_type: 'customer_payment',
      ref_id: paymentId,
      user_id: actor.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    });

    if (cbErr) {
      // Non-fatal — the payment itself succeeded. Log + continue.
      console.warn('Failed to record cashbox transaction for customer payment:', cbErr.message);
    }
  }

  // ─── 6. Audit log ──────────────────────────────────────────────────
  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: PAYMENT_TABLE,
    entityId: paymentId,
    after: {
      customerId,
      customerName: customer.name,
      amount: input.amount,
      method: input.paymentMethod,
      reference: input.reference ?? null,
      balanceBefore: customer.balance,
      balanceAfter: newBalance,
    },
  });

  return {
    payment: paymentRow as unknown as CustomerPayment,
    customer: updatedCustomer as Customer,
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
