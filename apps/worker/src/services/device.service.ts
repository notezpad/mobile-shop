/**
 * Device unit service — manages individual IMEI-tracked devices.
 *
 * Notes:
 *  - IMEI is unique system-wide (partial unique index in DB).
 *  - Supports batch import: scan or paste a list of IMEIs, validate each.
 *  - Status transitions:
 *      in_stock → reserved (when added to a sale cart)
 *      reserved → sold (sale completed)
 *      sold → returned (customer return)
 *      in_stock → defective (manual)
 *  - Devices can be transferred between branches (Phase 4: stock_transfers).
 */
import {
  AppError,
  ERROR_CODES,
  type DeviceUnit,
  type PaginatedResult,
  type CreateDeviceUnitInput,
  type BatchCreateDeviceUnitsInput,
  type UpdateDeviceUnitInput,
  type DeviceUnitQuery,
  type DeviceUnitStatus,
  type BatchImportResult,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'device_units';

/** List device units with filters + pagination. */
export async function listDeviceUnits(
  supabase: LooseSupabaseClient,
  query: DeviceUnitQuery,
): Promise<PaginatedResult<DeviceUnit>> {
  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`imei1.ilike.%${query.search}%,imei2.ilike.%${query.search}%,serial_number.ilike.%${query.search}%`);
  }
  if (query.productId) q = q.eq('product_id', query.productId);
  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.status) q = q.eq('status', query.status);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'imei1': return 'imei1';
      case 'cost': return 'cost';
      case 'salePrice': return 'sale_price';
      case 'status': return 'status';
      default: return 'received_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as DeviceUnit[];
  const total = count ?? 0;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Get a single device unit. */
export async function getDeviceUnit(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<DeviceUnit> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'الجهاز غير موجود');

  return data as DeviceUnit;
}

/** Find a device unit by IMEI1 (used in POS scanner lookup). */
export async function findByImei(
  supabase: LooseSupabaseClient,
  imei: string,
): Promise<DeviceUnit> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .or(`imei1.eq.${imei},imei2.eq.${imei}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, `لا يوجد جهاز بـ IMEI: ${imei}`);

  return data as DeviceUnit;
}

/** Create a single device unit. */
export async function createDeviceUnit(
  supabase: LooseSupabaseClient,
  input: CreateDeviceUnitInput,
  actor: AccessTokenUser,
): Promise<DeviceUnit> {
  // Validate IMEI uniqueness.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id, status')
    .or(`imei1.eq.${input.imei1},imei2.eq.${input.imei1}`)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    throw new AppError(
      ERROR_CODES.ALREADY_EXISTS,
      `IMEI مستخدم بالفعل (الحالة الحالية: ${existing.status})`,
    );
  }

  // Validate product exists and is IMEI-tracked.
  const { data: product } = await supabase
    .from('products')
    .select('id, type')
    .eq('id', input.productId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!product) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'المنتج غير موجود');
  }
  if (product.type !== 'imei') {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'لا يمكن إضافة وحدة IMEI لمنتج غير مُتبّع بالـ IMEI',
    );
  }

  // Validate branch exists.
  const { data: branch } = await supabase
    .from('branches')
    .select('id, is_active')
    .eq('id', input.branchId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!branch) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الفرع غير موجود');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: unit, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      product_id: input.productId,
      imei1: input.imei1,
      imei2: input.imei2 ?? null,
      serial_number: input.serialNumber ?? null,
      branch_id: input.branchId,
      status: 'in_stock',
      cost: input.cost,
      sale_price: input.salePrice,
      received_at: now,
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
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'IMEI مكرر');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: { imei1: input.imei1, productId: input.productId, branchId: input.branchId },
  });

  return unit as DeviceUnit;
}

/** Batch import device units — efficient for bulk IMEI entry. */
export async function batchCreateDeviceUnits(
  supabase: LooseSupabaseClient,
  input: BatchCreateDeviceUnitsInput,
  actor: AccessTokenUser,
): Promise<BatchImportResult> {
  // Validate product + branch.
  const { data: product } = await supabase
    .from('products')
    .select('id, type')
    .eq('id', input.productId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!product) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'المنتج غير موجود');
  }
  if (product.type !== 'imei') {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'المنتج غير مُتبّع بالـ IMEI',
    );
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', input.branchId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!branch) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الفرع غير موجود');
  }

  // Check which IMEIs already exist.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('imei1')
    .in('imei1', input.imeis)
    .is('deleted_at', null);
  const existingSet = new Set((existing ?? []).map((r: { imei1: string }) => r.imei1));

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const imei of input.imeis) {
    if (existingSet.has(imei)) continue;
    rows.push({
      id: crypto.randomUUID(),
      product_id: input.productId,
      imei1: imei,
      imei2: null,
      serial_number: null,
      branch_id: input.branchId,
      status: 'in_stock',
      cost: input.cost,
      sale_price: input.salePrice,
      received_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
      created_by: actor.id,
      updated_by: actor.id,
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    const { error } = await supabase.from(TABLE).insert(rows);
    if (error) {
      if (error.code === '23505') {
        // Some IMEIs were duplicated between requests — re-fetch and retry
        // For now, surface the error.
        throw new AppError(ERROR_CODES.ALREADY_EXISTS, error.message);
      }
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
    }
    inserted = rows.length;
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: null,
    after: { productId: input.productId, branchId: input.branchId, count: inserted },
  });

  return {
    inserted,
    duplicates: input.imeis.filter((i) => existingSet.has(i)),
    invalid: [],
  };
}

/** Update device unit — status change, price change, or branch transfer. */
export async function updateDeviceUnit(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateDeviceUnitInput,
  actor: AccessTokenUser,
): Promise<DeviceUnit> {
  const existing = await getDeviceUnit(supabase, id);

  // Validate status transition.
  if (input.status && input.status !== existing.status) {
    validateStatusTransition(existing.status, input.status);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.status !== undefined) updates.status = input.status;
  if (input.cost !== undefined) updates.cost = input.cost;
  if (input.salePrice !== undefined) updates.sale_price = input.salePrice;
  if (input.branchId !== undefined) updates.branch_id = input.branchId;

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
    before: { status: existing.status, branchId: existing.branch_id },
    after: { status: updated.status, branchId: updated.branch_id },
  });

  return updated as DeviceUnit;
}

/** Soft-delete a device unit (rarely used — usually only for data-entry errors). */
export async function deleteDeviceUnit(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const unit = await getDeviceUnit(supabase, id);

  if (unit.status === 'sold') {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'لا يمكن حذف جهاز مباع. استخدم المرتجعات.',
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      deleted_at: now,
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
    before: { imei1: unit.imei1, status: unit.status },
  });
}

/** Validate status transition per business rules. */
function validateStatusTransition(from: DeviceUnitStatus, to: DeviceUnitStatus): void {
  const allowed: Record<DeviceUnitStatus, DeviceUnitStatus[]> = {
    in_stock: ['reserved', 'sold', 'defective'],
    reserved: ['in_stock', 'sold', 'defective'],
    sold: ['returned'],
    returned: ['in_stock', 'defective'],
    defective: ['in_stock'],
  };
  if (!allowed[from]?.includes(to)) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن تغيير الحالة من "${from}" إلى "${to}"`,
    );
  }
}
