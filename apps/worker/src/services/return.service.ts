/**
 * Return service — customer returns items from a sale.
 *
 * Lifecycle:
 *  1. create  → status: 'pending' (no stock/customer changes yet)
 *  2. approve → status: 'approved' (manager approves the return)
 *  3. complete → status: 'completed' (stock returned + customer refunded)
 *
 * On complete:
 *  - Stock returned via stock_movement (type: 'return_in')
 *  - IMEI devices → status: 'returned' then 'in_stock'
 *  - Customer balance reduced (if credit/store_credit refund)
 *  - Audit log written
 */
import {
  AppError,
  ERROR_CODES,
  type Return as ReturnRecord,
  type PaginatedResult,
  type CreateReturnInput,
  type ReturnQuery,
  type ReturnWithDetails,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import { recordMovement } from './stock-movement.service';
import type { AccessTokenUser } from './auth.service';

const RETURN_TABLE = 'returns';
const ITEM_TABLE = 'return_items';

/** Generate return number: RET-YYYY-NNNNN */
async function generateReturnNo(
  supabase: LooseSupabaseClient,
  branchCode: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RET-${branchCode}-${year}-`;
  const { count } = await supabase
    .from(RETURN_TABLE)
    .select('id', { count: 'exact', head: true })
    .like('return_no', `${prefix}%`)
    .is('deleted_at', null);
  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

/** Create a return (status: pending). */
export async function createReturn(
  supabase: LooseSupabaseClient,
  input: CreateReturnInput,
  actor: AccessTokenUser,
): Promise<ReturnWithDetails> {
  const now = new Date().toISOString();
  const returnId = crypto.randomUUID();

  // ─── Load sale ───────────────────────────────────────────────────
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id, invoice_no, branch_id, customer_id, status, total')
    .eq('id', input.saleId)
    .is('deleted_at', null)
    .maybeSingle();
  if (saleErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, saleErr.message);
  if (!sale) throw new AppError(ERROR_CODES.NOT_FOUND, 'البيع غير موجود');

  const s = sale as {
    id: string;
    invoice_no: string;
    branch_id: string;
    customer_id: string | null;
    status: string;
    total: number;
  };

  if (s.status === 'voided') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن إنشاء مرتجع لبيع ملغى');
  }

  // ─── Validate branch ─────────────────────────────────────────────
  if (s.branch_id !== input.branchId) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'البيع لا ينتمي للفرع المحدد');
  }

  // ─── Load branch code ────────────────────────────────────────────
  const { data: branch } = await supabase
    .from('branches')
    .select('code')
    .eq('id', input.branchId)
    .maybeSingle();
  const branchCode = (branch as { code: string } | null)?.code ?? 'BR';

  // ─── Validate items + compute totals ─────────────────────────────
  let totalRefund = 0;
  const itemRows: Array<Record<string, unknown>> = [];

  for (const item of input.items) {
    // Load sale_item.
    const { data: saleItem, error: siErr } = await supabase
      .from('sale_items')
      .select('id, sale_id, product_id, device_unit_id, quantity, unit_price, total')
      .eq('id', item.saleItemId)
      .eq('sale_id', input.saleId)
      .is('deleted_at', null)
      .maybeSingle();
    if (siErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, siErr.message);
    if (!saleItem) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `صنف البيع غير موجود: ${item.saleItemId}`);
    }

    const si = saleItem as {
      id: string;
      sale_id: string;
      product_id: string;
      device_unit_id: string | null;
      quantity: number;
      unit_price: number;
      total: number;
    };

    // Check no existing return for this item exceeds quantity.
    const { data: existingReturns } = await supabase
      .from(ITEM_TABLE)
      .select('quantity')
      .eq('sale_item_id', item.saleItemId)
      .is('deleted_at', null);
    const alreadyReturned = (existingReturns ?? []).reduce(
      (sum: number, r: { quantity: number }) => sum + r.quantity,
      0,
    );
    if (item.quantity > si.quantity - alreadyReturned) {
      throw new AppError(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        `الكمية المرتجعة (${item.quantity}) تتجاوز الكمية المتاحة (${si.quantity - alreadyReturned})`,
      );
    }

    totalRefund += item.refundAmount;

    itemRows.push({
      id: crypto.randomUUID(),
      return_id: returnId,
      sale_item_id: item.saleItemId,
      quantity: item.quantity,
      refund_amount: item.refundAmount,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    });
  }

  // ─── Generate return_no ──────────────────────────────────────────
  const returnNo = await generateReturnNo(supabase, branchCode);

  // ─── Insert return ───────────────────────────────────────────────
  const { error: retErr } = await supabase.from(RETURN_TABLE).insert({
    id: returnId,
    return_no: returnNo,
    sale_id: input.saleId,
    branch_id: input.branchId,
    customer_id: input.customerId ?? s.customer_id,
    reason: input.reason ?? null,
    total: totalRefund,
    status: 'pending',
    refund_method: input.refundMethod,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });
  if (retErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, retErr.message);

  // ─── Insert return items ─────────────────────────────────────────
  const { error: itemsErr } = await supabase.from(ITEM_TABLE).insert(itemRows);
  if (itemsErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, itemsErr.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: RETURN_TABLE,
    entityId: returnId,
    after: { returnNo, saleInvoiceNo: s.invoice_no, total: totalRefund },
  });

  return getReturnWithDetails(supabase, returnId);
}

/** Approve + complete a return in one step (common case). */
export async function approveAndCompleteReturn(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<ReturnWithDetails> {
  const ret = await getReturnWithDetails(supabase, id);

  if (ret.status !== 'pending') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'المرتجع ليس في حالة pending');
  }

  const now = new Date().toISOString();

  // ─── Return stock + reverse device units ─────────────────────────
  for (const item of ret.items) {
    // Load sale_item to get product_id + device_unit_id.
    const { data: saleItem } = await supabase
      .from('sale_items')
      .select('product_id, device_unit_id')
      .eq('id', item.sale_item_id)
      .maybeSingle();
    const si = saleItem as { product_id: string; device_unit_id: string | null } | null;
    if (!si) continue;

    // Load product type.
    const { data: product } = await supabase
      .from('products')
      .select('type')
      .eq('id', si.product_id)
      .maybeSingle();
    const pType = (product as { type: string } | null)?.type;

    if (pType === 'standard') {
      // Return stock.
      await recordMovement(
        supabase,
        {
          productId: si.product_id,
          branchId: ret.branch_id,
          type: 'return_in',
          quantity: Math.abs(item.quantity),
          reason: `مرتجع: ${ret.return_no}`,
          refType: 'return',
          refId: id,
        },
        actor,
      );
    } else if (pType === 'imei' && si.device_unit_id) {
      // Mark device as returned then in_stock.
      await supabase
        .from('device_units')
        .update({
          status: 'in_stock',
          sale_id: null,
          updated_at: now,
          updated_by: actor.id,
        })
        .eq('id', si.device_unit_id);
    }
  }

  // ─── Refund customer balance ─────────────────────────────────────
  if (ret.customer_id && (ret.refund_method === 'credit' || ret.refund_method === 'store_credit')) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, balance, total_purchases')
      .eq('id', ret.customer_id)
      .maybeSingle();
    if (customer) {
      const c = customer as { id: string; balance: number; total_purchases: number };
      // Credit refund: reduce customer's debt.
      const newBalance = c.balance - ret.total;
      const newTotalPurchases = Math.max(0, c.total_purchases - ret.total);
      await supabase
        .from('customers')
        .update({
          balance: newBalance,
          total_purchases: newTotalPurchases,
          updated_at: now,
          updated_by: actor.id,
        })
        .eq('id', ret.customer_id);
    }
  }

  // ─── Mark return as completed ────────────────────────────────────
  const { error: updErr } = await supabase
    .from(RETURN_TABLE)
    .update({
      status: 'completed',
      approved_by: actor.id,
      approved_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, updErr.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: RETURN_TABLE,
    entityId: id,
    after: { status: 'completed', refundMethod: ret.refund_method, total: ret.total },
  });

  return getReturnWithDetails(supabase, id);
}

/** Reject a return (no stock/balance changes). */
export async function rejectReturn(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<ReturnWithDetails> {
  const ret = await getReturnWithDetails(supabase, id);
  if (ret.status !== 'pending') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'المرتجع ليس في حالة pending');
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(RETURN_TABLE)
    .update({
      status: 'rejected',
      approved_by: actor.id,
      approved_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: RETURN_TABLE,
    entityId: id,
    after: { status: 'rejected' },
  });

  return getReturnWithDetails(supabase, id);
}

/** Get return with items + names. */
export async function getReturnWithDetails(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<ReturnWithDetails> {
  const { data, error } = await supabase
    .from('v_returns_with_details')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'المرتجع غير موجود');
  return data as unknown as ReturnWithDetails;
}

/** List returns with filters. */
export async function listReturns(
  supabase: LooseSupabaseClient,
  query: ReturnQuery,
): Promise<PaginatedResult<ReturnWithDetails>> {
  let q = supabase
    .from('v_returns_list')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`return_no.ilike.%${query.search}%,sale_invoice_no.ilike.%${query.search}%`);
  }
  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.saleId) q = q.eq('sale_id', query.saleId);
  if (query.customerId) q = q.eq('customer_id', query.customerId);
  if (query.status) q = q.eq('status', query.status);
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);

  const sortColumn = query.sortBy === 'total' ? 'total' : 'created_at';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as unknown as ReturnWithDetails[];
  const total = count ?? 0;
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

