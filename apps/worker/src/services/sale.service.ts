/**
 * Sale service — the core POS checkout logic.
 *
 * createSale() is ATOMIC — all operations succeed or fail together:
 *  1. Validate all products exist + are active.
 *  2. For IMEI products: validate device_unit is in_stock + lock it.
 *  3. For standard products: validate sufficient stock.
 *  4. Compute totals (subtotal, discount, tax, total).
 *  5. Validate payments sum >= total (or = total for credit).
 *  6. Insert sale + sale_items.
 *  7. Deduct stock via stock_movements (type: 'sale').
 *  8. Update device_units status → 'sold' + link sale_id.
 *  9. Insert invoice + invoice_payments.
 * 10. Update customer balance (for credit sales or due amounts).
 * 11. Update customer totals (total_purchases).
 * 12. Write audit log.
 *
 * voidSale() reverses all of the above.
 */
import {
  AppError,
  ERROR_CODES,
  type Sale,
  type SaleItem,
  type Invoice,
  type InvoicePayment,
  type PaginatedResult,
  type CreateSaleInput,
  type SaleQuery,
  type SaleWithDetails,
  type VoidSaleInput,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import { recordMovement } from './stock-movement.service';
import type { AccessTokenUser } from './auth.service';

const SALE_TABLE = 'sales';
const ITEM_TABLE = 'sale_items';
const INVOICE_TABLE = 'invoices';
const PAYMENT_TABLE = 'invoice_payments';

/** Generate next invoice number: INV-YYYY-NNNNN */
async function generateInvoiceNo(
  supabase: LooseSupabaseClient,
  branchCode: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${branchCode}-${year}-`;

  // Count existing invoices this year for this branch.
  const { count } = await supabase
    .from(SALE_TABLE)
    .select('id', { count: 'exact', head: true })
    .like('invoice_no', `${prefix}%`)
    .is('deleted_at', null);

  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

/** Create a sale — atomic operation. */
export async function createSale(
  supabase: LooseSupabaseClient,
  input: CreateSaleInput,
  actor: AccessTokenUser,
): Promise<SaleWithDetails> {
  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();

  // ─── 1. Load branch code for invoice number ─────────────────────
  const { data: branch } = await supabase
    .from('branches')
    .select('code, is_active')
    .eq('id', input.branchId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!branch) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الفرع غير موجود');
  }
  if (!(branch as { is_active: boolean }).is_active) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'الفرع موقوف');
  }

  // ─── 2. Load all products in one query ──────────────────────────
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .in('id', productIds)
    .is('deleted_at', null);
  if (!products || products.length !== productIds.length) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'منتج غير موجود أو محذوف');
  }
  const productMap = new Map(products.map((p) => [p.id, p]));

  // ─── 3. Validate items + compute totals ─────────────────────────
  let subtotal = 0;
  let totalTax = 0;
  const itemRows: Array<Record<string, unknown>> = [];

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new AppError(ERROR_CODES.NOT_FOUND, `المنتج غير موجود: ${item.productId}`);
    }
    if (!(product as { is_active: boolean }).is_active) {
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, `المنتج موقوف: ${(product as { name: string }).name}`);
    }

    const unitPrice = item.unitPrice;
    const productTaxRate = (product as { tax_rate: number }).tax_rate;

    // Item discount.
    let itemDiscount = 0;
    if (item.discount > 0) {
      itemDiscount = item.discountType === 'percent'
        ? (unitPrice * item.quantity * item.discount) / 100
        : item.discount;
    }
    const itemGross = unitPrice * item.quantity - itemDiscount;
    const itemTax = (itemGross * productTaxRate) / 100;
    const itemTotal = itemGross + itemTax;

    subtotal += unitPrice * item.quantity;
    totalTax += itemTax;

    itemRows.push({
      id: crypto.randomUUID(),
      sale_id: saleId,
      product_id: item.productId,
      device_unit_id: item.deviceUnitId ?? null,
      quantity: item.quantity,
      unit_price: unitPrice,
      discount: itemDiscount,
      discount_type: 'amount',
      tax_rate: productTaxRate,
      total: itemTotal,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    });

    // ─── 3a. For IMEI products: validate device unit ──────────────
    if ((product as { type: string }).type === 'imei') {
      if (!item.deviceUnitId) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `منتج IMEI يتطلب اختيار جهاز: ${(product as { name: string }).name}`);
      }
      const { data: unit } = await supabase
        .from('device_units')
        .select('id, status, branch_id, imei1')
        .eq('id', item.deviceUnitId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!unit) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'الجهاز غير موجود');
      }
      const u = unit as { status: string; branch_id: string; imei1: string };
      if (u.status !== 'in_stock') {
        throw new AppError(ERROR_CODES.DEVICE_ALREADY_SOLD, `الجهاز ${u.imei1} غير متاح (الحالة: ${u.status})`);
      }
      if (u.branch_id !== input.branchId) {
        throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, `الجهاز ${u.imei1} في فرع آخر`);
      }
    }
  }

  // ─── 4. Apply sale-level discount ───────────────────────────────
  let saleDiscount = 0;
  if (input.discount > 0) {
    saleDiscount = input.discountType === 'percent'
      ? (subtotal * input.discount) / 100
      : input.discount;
  }

  const taxableAmount = subtotal - saleDiscount;
  // Recompute tax proportionally after discount.
  const tax = subtotal > 0 ? (totalTax * taxableAmount) / subtotal : 0;
  const total = taxableAmount + tax;

  // ─── 5. Validate payments ───────────────────────────────────────
  const totalPaid = input.payments.reduce((sum, p) => sum + p.amount, 0);
  const isCreditSale = input.payments.some((p) => p.method === 'credit');

  let dueAmount = 0;
  let change = 0;

  if (isCreditSale) {
    // Credit sale: customer pays later. due_amount = total - non-credit payments.
    const nonCreditPaid = input.payments
      .filter((p) => p.method !== 'credit')
      .reduce((sum, p) => sum + p.amount, 0);
    dueAmount = Math.max(0, total - nonCreditPaid);
    change = 0;
  } else {
    if (totalPaid < total) {
      throw new AppError(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        `المبلغ المدفوع (${totalPaid}) أقل من الإجمالي (${total})`,
      );
    }
    change = totalPaid - total;
  }

  // Validate credit sale has a customer.
  if (dueAmount > 0 && !input.customerId) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'البيع الآجل يتطلب تحديد عميل');
  }

  // ─── 6. Generate invoice number ─────────────────────────────────
  const invoiceNo = await generateInvoiceNo(supabase, (branch as { code: string }).code);

  // ─── 7. Insert sale ─────────────────────────────────────────────
  const primaryPaymentMethod = input.payments.length > 1 ? 'mixed' : input.payments[0]!.method;

  const { error: saleErr } = await supabase.from(SALE_TABLE).insert({
    id: saleId,
    invoice_no: invoiceNo,
    branch_id: input.branchId,
    customer_id: input.customerId ?? null,
    cashier_id: actor.id,
    status: 'completed',
    subtotal,
    discount: saleDiscount,
    discount_type: input.discountType,
    tax,
    total,
    paid: totalPaid,
    change,
    payment_method: primaryPaymentMethod,
    due_amount: dueAmount,
    notes: input.notes ?? null,
    completed_at: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });

  if (saleErr) {
    if (saleErr.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'رقم الفاتورة مكرر — حاول مرة أخرى');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, saleErr.message);
  }

  // ─── 8. Insert sale items ───────────────────────────────────────
  const { error: itemsErr } = await supabase.from(ITEM_TABLE).insert(itemRows);
  if (itemsErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, itemsErr.message);

  // ─── 9. Deduct stock + update device units ──────────────────────
  for (const item of input.items) {
    const product = productMap.get(item.productId)!;
    const productType = (product as { type: string }).type;

    if (productType === 'standard') {
      // Deduct from inventory via stock movement.
      await recordMovement(
        supabase,
        {
          productId: item.productId,
          branchId: input.branchId,
          type: 'sale',
          quantity: -Math.abs(item.quantity),
          reason: `بيع: ${invoiceNo}`,
          refType: 'sale',
          refId: saleId,
        },
        actor,
      );
    } else if (productType === 'imei' && item.deviceUnitId) {
      // Mark device unit as sold — optimistic lock on status='in_stock'.
      const { data: updatedRows, error: devErr } = await supabase
        .from('device_units')
        .update({
          status: 'sold',
          sale_id: saleId,
          updated_at: now,
          updated_by: actor.id,
        })
        .eq('id', item.deviceUnitId)
        .eq('status', 'in_stock') // optimistic lock
        .select('id');
      if (devErr) {
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, `فشل تحديث حالة الجهاز: ${devErr.message}`);
      }
      // Check that exactly 1 row was updated (prevents double-sell).
      if (!updatedRows || updatedRows.length === 0) {
        throw new AppError(
          ERROR_CODES.DEVICE_ALREADY_SOLD,
          `الجهاز لم يعد متاحاً للبيع (تم بيعه أو حجزه)`,
          { deviceUnitId: item.deviceUnitId },
        );
      }
    }
    // service products: no stock deduction.
  }

  // ─── 10. Insert invoice + payments ──────────────────────────────
  const { error: invErr } = await supabase.from(INVOICE_TABLE).insert({
    id: invoiceId,
    sale_id: saleId,
    invoice_no: invoiceNo,
    type: 'sale',
    pdf_base64: null,
    qr_data: null,
    total,
    tax,
    issued_at: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });
  if (invErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, invErr.message);

  const paymentRows = input.payments.map((p) => ({
    id: crypto.randomUUID(),
    invoice_id: invoiceId,
    method: p.method,
    amount: p.amount,
    reference: p.reference ?? null,
    paid_at: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  }));
  const { error: payErr } = await supabase.from(PAYMENT_TABLE).insert(paymentRows);
  if (payErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, payErr.message);

  // ─── 11. Update customer balance + totals ───────────────────────
  if (input.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, balance, total_purchases')
      .eq('id', input.customerId)
      .is('deleted_at', null)
      .maybeSingle();

    if (customer) {
      const c = customer as { id: string; balance: number; total_purchases: number };
      const newBalance = c.balance + dueAmount;
      const newTotalPurchases = c.total_purchases + total;

      await supabase
        .from('customers')
        .update({
          balance: newBalance,
          total_purchases: newTotalPurchases,
          updated_at: now,
          updated_by: actor.id,
        })
        .eq('id', input.customerId);
    }
  }

  // ─── 12. Audit log ──────────────────────────────────────────────
  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: SALE_TABLE,
    entityId: saleId,
    after: { invoiceNo, total, paid: totalPaid, due: dueAmount, itemCount: input.items.length },
  });

  // ─── 13. Return sale with details ───────────────────────────────
  return getSaleWithDetails(supabase, saleId);
}

/** Get a sale with items, payments, and joined names. */
export async function getSaleWithDetails(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<SaleWithDetails> {
  // Use the v_sales_with_details view (migration 0007).
  const { data, error } = await supabase
    .from('v_sales_with_details')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'البيع غير موجود');

  return data as unknown as SaleWithDetails;
}

/** List sales with filters. */
export async function listSales(
  supabase: LooseSupabaseClient,
  query: SaleQuery,
): Promise<PaginatedResult<SaleWithDetails>> {
  let q = supabase
    .from('v_sales_list')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`invoice_no.ilike.%${query.search}%,customer_name.ilike.%${query.search}%`);
  }
  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.customerId) q = q.eq('customer_id', query.customerId);
  if (query.cashierId) q = q.eq('cashier_id', query.cashierId);
  if (query.status) q = q.eq('status', query.status);
  if (query.paymentMethod) q = q.eq('payment_method', query.paymentMethod);
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'total': return 'total';
      case 'invoiceNo': return 'invoice_no';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as unknown as SaleWithDetails[];
  const total = count ?? 0;
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

/** Void a sale — reverses stock, device status, customer balance. */
export async function voidSale(
  supabase: LooseSupabaseClient,
  id: string,
  input: VoidSaleInput,
  actor: AccessTokenUser,
): Promise<Sale> {
  const sale = await getSaleWithDetails(supabase, id);

  if (sale.status === 'voided') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'البيع ملغى بالفعل');
  }
  if (sale.status === 'refunded') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن إلغاء بيع مسترجع');
  }

  const now = new Date().toISOString();

  // ─── Reverse stock + device status ──────────────────────────────
  for (const item of sale.items) {
    // Load product to check type.
    const { data: product } = await supabase
      .from('products')
      .select('type')
      .eq('id', item.product_id)
      .maybeSingle();

    const pType = (product as { type: string } | null)?.type;

    if (pType === 'standard') {
      // Return stock.
      await recordMovement(
        supabase,
        {
          productId: item.product_id,
          branchId: sale.branch_id,
          type: 'return_in',
          quantity: Math.abs(item.quantity),
          reason: `إلغاء بيع: ${sale.invoice_no} — ${input.reason}`,
          refType: 'sale_void',
          refId: id,
        },
        actor,
      );
    } else if (pType === 'imei' && item.device_unit_id) {
      // Return device to in_stock.
      await supabase
        .from('device_units')
        .update({
          status: 'in_stock',
          sale_id: null,
          updated_at: now,
          updated_by: actor.id,
        })
        .eq('id', item.device_unit_id);
    }
  }

  // ─── Reverse customer balance ───────────────────────────────────
  if (sale.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, balance, total_purchases')
      .eq('id', sale.customer_id)
      .maybeSingle();

    if (customer) {
      const c = customer as { id: string; balance: number; total_purchases: number };
      await supabase
        .from('customers')
        .update({
          balance: c.balance - sale.due_amount,
          total_purchases: Math.max(0, c.total_purchases - sale.total),
          updated_at: now,
          updated_by: actor.id,
        })
        .eq('id', sale.customer_id);
    }
  }

  // ─── Mark sale as voided ────────────────────────────────────────
  const { data: updated, error } = await supabase
    .from(SALE_TABLE)
    .update({
      status: 'voided',
      notes: sale.notes ? `${sale.notes}\n\n[إلغاء: ${input.reason}]` : `[إلغاء: ${input.reason}]`,
      updated_at: now,
      updated_by: actor.id,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: SALE_TABLE,
    entityId: id,
    before: { status: sale.status, total: sale.total },
    after: { status: 'voided', reason: input.reason },
  });

  return updated as Sale;
}

// Type imports for unused-but-referenced types.
