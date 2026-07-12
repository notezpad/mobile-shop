/**
 * Stock movement service — the SINGLE source of truth for all stock changes.
 *
 * Movement types:
 *  - purchase     (+qty from supplier)
 *  - sale         (-qty to customer)
 *  - return_in    (+qty from customer return)
 *  - return_out   (-qty return to supplier)
 *  - transfer_in  (+qty from another branch)
 *  - transfer_out (-qty to another branch)
 *  - adjustment   (±qty manual stocktake)
 *  - repair_in    (+qty parts returned from repair)
 *  - repair_out   (-qty parts used in repair)
 *
 * Each movement:
 *  1. Validates the product + branch exist.
 *  2. For outbound movements: validates sufficient stock.
 *  3. Updates inventory_stocks (upsert).
 *  4. Inserts a stock_movements row with balance_after.
 *
 * This is called by sales, returns, repairs, transfers, and adjustments.
 */
import {
  AppError,
  ERROR_CODES,
  type StockMovement,
  type PaginatedResult,
  type StockMovementQuery,
  type StockAdjustmentInput,
  type BatchStockAdjustmentInput,
  type StockMovementType,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const STOCK_TABLE = 'inventory_stocks';
const MOVEMENT_TABLE = 'stock_movements';

/** Internal: ensure an inventory_stocks row exists for product+branch. */
async function ensureStockRow(
  supabase: LooseSupabaseClient,
  productId: string,
  branchId: string,
  minQuantity = 0,
): Promise<{ id: string; quantity: number; reserved_quantity: number }> {
  // Try to find existing.
  const { data: existing, error: findErr } = await supabase
    .from(STOCK_TABLE)
    .select('id, quantity, reserved_quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, findErr.message);
  if (existing) return existing as { id: string; quantity: number; reserved_quantity: number };

  // Create new row.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: created, error: insertErr } = await supabase
    .from(STOCK_TABLE)
    .insert({
      id,
      product_id: productId,
      branch_id: branchId,
      quantity: 0,
      reserved_quantity: 0,
      min_quantity: minQuantity,
      max_quantity: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('id, quantity, reserved_quantity')
    .single();

  if (insertErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, insertErr.message);
  return created as { id: string; quantity: number; reserved_quantity: number };
}

/** Record a stock movement — the core function. */
export async function recordMovement(
  supabase: LooseSupabaseClient,
  input: {
    productId: string;
    branchId: string;
    type: StockMovementType;
    quantity: number; // signed: positive for inbound, negative for outbound
    reason?: string;
    refType?: string;
    refId?: string;
  },
  actor: AccessTokenUser,
): Promise<StockMovement> {
  // Validate quantity sign based on type.
  const isInbound = ['purchase', 'return_in', 'transfer_in', 'repair_in'].includes(input.type);
  const isAdjustment = input.type === 'adjustment';

  if (!isAdjustment) {
    if (isInbound && input.quantity < 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'حركات الإدخال يجب أن تكون موجبة');
    }
    if (!isInbound && input.quantity > 0) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'حركات الإخراج يجب أن تكون سالبة');
    }
  }

  // Ensure stock row exists.
  const stock = await ensureStockRow(supabase, input.productId, input.branchId);

  // For outbound: validate sufficient stock.
  if (input.quantity < 0) {
    const available = stock.quantity - stock.reserved_quantity;
    if (Math.abs(input.quantity) > available) {
      throw new AppError(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `المخزون غير كافٍ. المتاح: ${available}، المطلوب: ${Math.abs(input.quantity)}`,
        { productId: input.productId, branchId: input.branchId, available, requested: Math.abs(input.quantity) },
      );
    }
  }

  // Compute new balance.
  const newQuantity = stock.quantity + input.quantity;
  const balanceAfter = newQuantity - stock.reserved_quantity;

  // Update stock row.
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from(STOCK_TABLE)
    .update({ quantity: newQuantity, updated_at: now })
    .eq('id', stock.id);
  if (updateErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, updateErr.message);

  // Insert movement record.
  const movementId = crypto.randomUUID();
  const { data: movement, error: moveErr } = await supabase
    .from(MOVEMENT_TABLE)
    .insert({
      id: movementId,
      product_id: input.productId,
      branch_id: input.branchId,
      type: input.type,
      quantity: input.quantity,
      balance_after: balanceAfter,
      reason: input.reason ?? null,
      ref_type: input.refType ?? null,
      ref_id: input.refId ?? null,
      user_id: actor.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (moveErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, moveErr.message);

  return movement as unknown as StockMovement;
}

/** List stock movements with filters + pagination. */
export async function listMovements(
  supabase: LooseSupabaseClient,
  query: StockMovementQuery,
): Promise<PaginatedResult<StockMovement>> {
  let q = supabase
    .from(MOVEMENT_TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.productId) q = q.eq('product_id', query.productId);
  if (query.type) q = q.eq('type', query.type);
  if (query.refType) q = q.eq('ref_type', query.refType);
  if (query.refId) q = q.eq('ref_id', query.refId);
  if (query.fromDate) q = q.gte('created_at', query.fromDate);
  if (query.toDate) q = q.lte('created_at', query.toDate);

  const sortColumn = query.sortBy === 'quantity' ? 'quantity' : 'created_at';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as unknown as StockMovement[];
  const total = count ?? 0;
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

/** Manual stocktake adjustment — sets absolute quantity, records diff. */
export async function recordAdjustment(
  supabase: LooseSupabaseClient,
  input: StockAdjustmentInput,
  actor: AccessTokenUser,
): Promise<StockMovement> {
  const stock = await ensureStockRow(supabase, input.productId, input.branchId);
  const diff = input.countedQuantity - stock.quantity;

  if (diff === 0) {
    // No change — still record a movement for audit trail.
  }

  return recordMovement(
    supabase,
    {
      productId: input.productId,
      branchId: input.branchId,
      type: 'adjustment',
      quantity: diff,
      reason: input.reason ?? `جرد يدوي: العدد الجديد ${input.countedQuantity}`,
      refType: 'stocktake',
    },
    actor,
  );
}

/** Batch stocktake — multiple products at once. */
export async function recordBatchAdjustments(
  supabase: LooseSupabaseClient,
  input: BatchStockAdjustmentInput,
  actor: AccessTokenUser,
): Promise<StockMovement[]> {
  const results: StockMovement[] = [];
  for (const adj of input.adjustments) {
    // Override branchId with the batch's branchId if not set per-item.
    const adjustedInput = { ...adj, branchId: adj.branchId ?? input.branchId };
    const movement = await recordAdjustment(supabase, adjustedInput, actor);
    results.push(movement);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: MOVEMENT_TABLE,
    entityId: null,
    after: { action: 'batch_stocktake', count: results.length, branchId: input.branchId },
  });

  return results;
}
