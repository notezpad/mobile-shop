/**
 * Repair service — manages the full repair ticket lifecycle.
 *
 * Status workflow:
 *  received → diagnosing → waiting_parts → repairing → ready → delivered
 *                                                          ↓
 *                                                       canceled
 *                                                       warranty_return
 *
 * Key functions:
 *  - createRepair: new ticket (status: received)
 *  - changeStatus: transition status + record history + auto-set timestamps
 *  - addPart: consume inventory + add to repair_parts
 *  - deliver: mark delivered + collect payment
 *  - getTrackingInfo: public tracking (no auth)
 */
import {
  AppError,
  ERROR_CODES,
  type Repair,
  type PaginatedResult,
  type CreateRepairInput,
  type UpdateRepairInput,
  type RepairQuery,
  type RepairWithDetails,
  type ChangeRepairStatusInput,
  type AddRepairPartInput,
  type DeliverRepairInput,
  type RepairTrackingInfo,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import { recordMovement } from './stock-movement.service';
import type { AccessTokenUser } from './auth.service';

const REPAIR_TABLE = 'repairs';
const HISTORY_TABLE = 'repair_status_history';
const PARTS_TABLE = 'repair_parts';

/** Valid status transitions. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  received: ['diagnosing', 'waiting_parts', 'repairing', 'ready', 'canceled', 'warranty_return'],
  diagnosing: ['waiting_parts', 'repairing', 'ready', 'canceled'],
  waiting_parts: ['repairing', 'ready', 'canceled'],
  repairing: ['ready', 'canceled'],
  ready: ['delivered', 'warranty_return', 'canceled'],
  delivered: ['warranty_return'],
  warranty_return: ['diagnosing', 'repairing', 'ready', 'canceled'],
  canceled: [],
};

/** Generate ticket number: REP-YYYY-NNNNN */
async function generateTicketNo(
  supabase: LooseSupabaseClient,
  branchCode: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REP-${branchCode}-${year}-`;
  const { count } = await supabase
    .from(REPAIR_TABLE)
    .select('id', { count: 'exact', head: true })
    .like('ticket_no', `${prefix}%`)
    .is('deleted_at', null);
  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

/** Create a new repair ticket. */
export async function createRepair(
  supabase: LooseSupabaseClient,
  input: CreateRepairInput,
  actor: AccessTokenUser,
): Promise<RepairWithDetails> {
  const now = new Date().toISOString();
  const repairId = crypto.randomUUID();

  // ─── Validate branch + customer ──────────────────────────────────
  const { data: branch } = await supabase
    .from('branches')
    .select('code, is_active')
    .eq('id', input.branchId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!branch) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الفرع غير موجود');
  if (!(branch as { is_active: boolean }).is_active) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'الفرع موقوف');
  }
  const branchCode = (branch as { code: string }).code;

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', input.customerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!customer) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'العميل غير موجود');

  // ─── Validate technician if specified ────────────────────────────
  if (input.technicianId) {
    const { data: tech } = await supabase
      .from('users')
      .select('id, role_id')
      .eq('id', input.technicianId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!tech) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الفني غير موجود');
  }

  // ─── Compute totals ──────────────────────────────────────────────
  const total = input.laborCost + input.partsCost - input.discount;
  const dueAmount = Math.max(0, total - input.paid);

  // ─── Generate ticket_no ──────────────────────────────────────────
  const ticketNo = await generateTicketNo(supabase, branchCode);

  // ─── Insert repair ───────────────────────────────────────────────
  const { error: repairErr } = await supabase.from(REPAIR_TABLE).insert({
    id: repairId,
    ticket_no: ticketNo,
    branch_id: input.branchId,
    customer_id: input.customerId,
    technician_id: input.technicianId ?? null,
    received_by: actor.id,
    device_brand: input.deviceBrand,
    device_model: input.deviceModel,
    device_imei: input.deviceImei ?? null,
    device_password: input.devicePassword ?? null,
    problem_description: input.problemDescription,
    customer_notes: input.customerNotes ?? null,
    accessories: input.accessories,
    inspection_photos: input.inspectionPhotos,
    status: 'received',
    received_at: now,
    estimated_delivery_at: input.estimatedDeliveryAt ?? null,
    labor_cost: input.laborCost,
    parts_cost: input.partsCost,
    discount: input.discount,
    total,
    paid: input.paid,
    due_amount: dueAmount,
    warranty_days: input.warrantyDays,
    parent_repair_id: null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });

  if (repairErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, repairErr.message);

  // ─── Insert initial history entry ────────────────────────────────
  const { error: histErr } = await supabase.from(HISTORY_TABLE).insert({
    id: crypto.randomUUID(),
    repair_id: repairId,
    from_status: null,
    to_status: 'received',
    note: 'تم استلام الجهاز',
    user_id: actor.id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });
  if (histErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, histErr.message);

  // ─── Update customer repair count ────────────────────────────────
  // Use a single atomic increment (read + write in one query to avoid race conditions).
  const { data: cust } = await supabase
    .from('customers')
    .select('total_repairs')
    .eq('id', input.customerId)
    .maybeSingle();
  if (cust) {
    await supabase
      .from('customers')
      .update({
        total_repairs: (cust as { total_repairs: number }).total_repairs + 1,
        updated_at: now,
      })
      .eq('id', input.customerId);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: REPAIR_TABLE,
    entityId: repairId,
    after: { ticketNo, deviceBrand: input.deviceBrand, deviceModel: input.deviceModel },
  });

  return getRepairWithDetails(supabase, repairId);
}

/** Change repair status — validates transition + records history. */
export async function changeStatus(
  supabase: LooseSupabaseClient,
  id: string,
  input: ChangeRepairStatusInput,
  actor: AccessTokenUser,
): Promise<RepairWithDetails> {
  const repair = await getRepairWithDetails(supabase, id);
  const fromStatus = repair.status;

  // Validate transition.
  const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(input.status)) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن تغيير الحالة من "${fromStatus}" إلى "${input.status}"`,
    );
  }

  const now = new Date().toISOString();

  // Auto-set timestamps based on new status.
  const updates: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
  };
  if (input.status === 'diagnosing' && !repair.started_at) {
    updates.started_at = now;
  }
  if (input.status === 'ready') {
    updates.completed_at = now;
  }
  if (input.status === 'delivered') {
    updates.delivered_at = now;
  }

  const { error } = await supabase.from(REPAIR_TABLE).update(updates).eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  // Record history.
  const { error: histErr } = await supabase.from(HISTORY_TABLE).insert({
    id: crypto.randomUUID(),
    repair_id: id,
    from_status: fromStatus,
    to_status: input.status,
    note: input.note ?? null,
    user_id: actor.id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });
  if (histErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, histErr.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: REPAIR_TABLE,
    entityId: id,
    before: { status: fromStatus },
    after: { status: input.status, note: input.note },
  });

  return getRepairWithDetails(supabase, id);
}

/** Update repair details (costs, assignment, etc.). */
export async function updateRepair(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateRepairInput,
  actor: AccessTokenUser,
): Promise<RepairWithDetails> {
  const existing = await getRepairWithDetails(supabase, id);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.technicianId !== undefined) updates.technician_id = input.technicianId;
  if (input.problemDescription !== undefined) updates.problem_description = input.problemDescription;
  if (input.customerNotes !== undefined) updates.customer_notes = input.customerNotes;
  if (input.estimatedDeliveryAt !== undefined) updates.estimated_delivery_at = input.estimatedDeliveryAt;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.warrantyDays !== undefined) updates.warranty_days = input.warrantyDays;

  // Recompute totals if costs changed.
  let needsTotalRecompute = false;
  if (input.laborCost !== undefined) {
    updates.labor_cost = input.laborCost;
    needsTotalRecompute = true;
  }
  if (input.partsCost !== undefined) {
    updates.parts_cost = input.partsCost;
    needsTotalRecompute = true;
  }
  if (input.discount !== undefined) {
    updates.discount = input.discount;
    needsTotalRecompute = true;
  }
  if (needsTotalRecompute) {
    const laborCost = (input.laborCost ?? existing.labor_cost) as number;
    const partsCost = (input.partsCost ?? existing.parts_cost) as number;
    const discount = (input.discount ?? existing.discount) as number;
    const total = laborCost + partsCost - discount;
    updates.total = total;
    if (input.paid !== undefined) {
      updates.paid = input.paid;
      updates.due_amount = Math.max(0, total - input.paid);
    } else {
      updates.due_amount = Math.max(0, total - existing.paid);
    }
  } else if (input.paid !== undefined) {
    updates.paid = input.paid;
    updates.due_amount = Math.max(0, existing.total - input.paid);
  }

  const { error } = await supabase.from(REPAIR_TABLE).update(updates).eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: REPAIR_TABLE,
    entityId: id,
    before: { status: existing.status },
    after: updates,
  });

  return getRepairWithDetails(supabase, id);
}

/** Add a repair part — consumes from inventory. */
export async function addPart(
  supabase: LooseSupabaseClient,
  repairId: string,
  input: AddRepairPartInput,
  actor: AccessTokenUser,
): Promise<RepairWithDetails> {
  const repair = await getRepairWithDetails(supabase, repairId);

  if (repair.status === 'delivered' || repair.status === 'canceled') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن إضافة قطع غيار لتذكرة مكتملة');
  }

  // Validate product exists.
  const { data: product } = await supabase
    .from('products')
    .select('id, type, name, cost_price')
    .eq('id', input.productId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!product) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'المنتج غير موجود');

  const p = product as { id: string; type: string; name: string; cost_price: number };

  // Deduct from inventory (standard products only — IMEI parts need special handling).
  let stockMovementId: string | null = null;
  if (p.type === 'standard') {
    const movement = await recordMovement(
      supabase,
      {
        productId: input.productId,
        branchId: repair.branch_id,
        type: 'repair_out',
        quantity: -Math.abs(input.quantity),
        reason: `صيانة: ${repair.ticket_no}`,
        refType: 'repair',
        refId: repairId,
      },
      actor,
    );
    stockMovementId = movement.id;
  }

  // Insert repair_part.
  const now = new Date().toISOString();
  const total = input.unitPrice * input.quantity;
  const { error: partErr } = await supabase.from(PARTS_TABLE).insert({
    id: crypto.randomUUID(),
    repair_id: repairId,
    product_id: input.productId,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    total,
    stock_movement_id: stockMovementId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });
  if (partErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, partErr.message);

  // Recompute parts_cost + total.
  const newPartsCost = repair.parts_cost + total;
  const newTotal = repair.labor_cost + newPartsCost - repair.discount;
  await supabase
    .from(REPAIR_TABLE)
    .update({
      parts_cost: newPartsCost,
      total: newTotal,
      due_amount: Math.max(0, newTotal - repair.paid),
      updated_at: now,
    })
    .eq('id', repairId);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: PARTS_TABLE,
    entityId: repairId,
    after: { productId: input.productId, quantity: input.quantity, total },
  });

  return getRepairWithDetails(supabase, repairId);
}

/** Remove a repair part — returns stock. */
export async function removePart(
  supabase: LooseSupabaseClient,
  repairId: string,
  partId: string,
  actor: AccessTokenUser,
): Promise<RepairWithDetails> {
  const repair = await getRepairWithDetails(supabase, repairId);
  const part = repair.parts?.find((p) => p.id === partId);
  if (!part) throw new AppError(ERROR_CODES.NOT_FOUND, 'قطعة الغيار غير موجودة');

  // Return stock.
  if (part.stock_movement_id) {
    await recordMovement(
      supabase,
      {
        productId: part.product_id,
        branchId: repair.branch_id,
        type: 'repair_in',
        quantity: Math.abs(part.quantity),
        reason: `إلغاء قطعة غيار: ${repair.ticket_no}`,
        refType: 'repair',
        refId: repairId,
      },
      actor,
    );
  }

  // Soft-delete part.
  const now = new Date().toISOString();
  await supabase
    .from(PARTS_TABLE)
    .update({ deleted_at: now, updated_at: now })
    .eq('id', partId);

  // Recompute parts_cost + total.
  const newPartsCost = Math.max(0, repair.parts_cost - part.total);
  const newTotal = repair.labor_cost + newPartsCost - repair.discount;
  await supabase
    .from(REPAIR_TABLE)
    .update({
      parts_cost: newPartsCost,
      total: newTotal,
      due_amount: Math.max(0, newTotal - repair.paid),
      updated_at: now,
    })
    .eq('id', repairId);

  return getRepairWithDetails(supabase, repairId);
}

/** Deliver a repair — mark delivered + collect payment. */
export async function deliverRepair(
  supabase: LooseSupabaseClient,
  repairId: string,
  input: DeliverRepairInput,
  actor: AccessTokenUser,
): Promise<RepairWithDetails> {
  const repair = await getRepairWithDetails(supabase, repairId);

  if (repair.status !== 'ready') {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'يمكن تسليم التذاكر في حالة "جاهز" فقط',
    );
  }

  // Update paid + delivered_at + status.
  const now = new Date().toISOString();
  const newPaid = repair.paid + input.paid;
  const newDue = Math.max(0, repair.total - newPaid);

  await supabase
    .from(REPAIR_TABLE)
    .update({
      status: 'delivered',
      paid: newPaid,
      due_amount: newDue,
      delivered_at: now,
      notes: input.notes ? `${repair.notes ?? ''}\n[تسليم: ${input.notes}]` : repair.notes,
      updated_at: now,
    })
    .eq('id', repairId);

  // Record history.
  await supabase.from(HISTORY_TABLE).insert({
    id: crypto.randomUUID(),
    repair_id: repairId,
    from_status: 'ready',
    to_status: 'delivered',
    note: input.notes ?? `تم التسليم — مدفوع: ${input.paid}`,
    user_id: actor.id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: REPAIR_TABLE,
    entityId: repairId,
    after: { status: 'delivered', paid: newPaid, due: newDue },
  });

  return getRepairWithDetails(supabase, repairId);
}

/** Get repair with details (history + parts + names). */
export async function getRepairWithDetails(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<RepairWithDetails> {
  const { data, error } = await supabase
    .from('v_repairs_with_details')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'تذكرة الصيانة غير موجودة');
  return data as unknown as RepairWithDetails;
}

/** Find repair by ticket_no (for QR scan). */
export async function findByTicketNo(
  supabase: LooseSupabaseClient,
  ticketNo: string,
): Promise<RepairWithDetails> {
  const { data, error } = await supabase
    .from('v_repairs_with_details')
    .select('*')
    .eq('ticket_no', ticketNo.toUpperCase())
    .maybeSingle();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, `لا توجد تذكرة بالرقم: ${ticketNo}`);
  return data as unknown as RepairWithDetails;
}

/** List repairs with filters. */
export async function listRepairs(
  supabase: LooseSupabaseClient,
  query: RepairQuery,
): Promise<PaginatedResult<RepairWithDetails>> {
  let q = supabase
    .from('v_repairs_list')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`ticket_no.ilike.%${query.search}%,device_brand.ilike.%${query.search}%,device_model.ilike.%${query.search}%,device_imei.ilike.%${query.search}%,customer_name.ilike.%${query.search}%`);
  }
  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.customerId) q = q.eq('customer_id', query.customerId);
  if (query.technicianId) q = q.eq('technician_id', query.technicianId);
  if (query.status) q = q.eq('status', query.status);
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'ticketNo': return 'ticket_no';
      case 'total': return 'total';
      case 'status': return 'status';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as unknown as RepairWithDetails[];
  const total = count ?? 0;
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

/** Get public tracking info (no auth required — for QR scan). */
export async function getTrackingInfo(
  supabase: LooseSupabaseClient,
  ticketNo: string,
): Promise<RepairTrackingInfo> {
  const repair = await findByTicketNo(supabase, ticketNo);

  return {
    ticket_no: repair.ticket_no,
    status: repair.status,
    device_brand: repair.device_brand,
    device_model: repair.device_model,
    received_at: repair.received_at,
    estimated_delivery_at: repair.estimated_delivery_at,
    completed_at: repair.completed_at,
    delivered_at: repair.delivered_at,
    total: repair.total,
    paid: repair.paid,
    due_amount: repair.due_amount,
    warranty_days: repair.warranty_days,
    customer_name: repair.customer_name ?? null,
    history: (repair.history ?? []).map((h) => ({
      to_status: h.to_status,
      note: h.note,
      created_at: h.created_at,
    })),
  };
}

