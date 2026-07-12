/**
 * Stock transfer service — move stock between branches.
 *
 * Lifecycle:
 *  1. create  → status: 'draft' (stock NOT yet deducted)
 *  2. ship    → status: 'in_transit' (stock deducted from source, movement recorded)
 *  3. receive → status: 'received' (stock added to destination, movement recorded)
 *  4. cancel  → status: 'canceled' (only from draft or in_transit)
 *
 * If canceled while in_transit, stock is returned to source.
 */
import {
  AppError,
  ERROR_CODES,
  type StockTransfer,
  type StockTransferItem,
  type PaginatedResult,
  type CreateStockTransferInput,
  type ReceiveStockTransferInput,
  type StockTransferQuery,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import { recordMovement } from './stock-movement.service';
import type { AccessTokenUser } from './auth.service';

const TRANSFER_TABLE = 'stock_transfers';
const ITEM_TABLE = 'stock_transfer_items';

/** List transfers with filters. */
export async function listTransfers(
  supabase: LooseSupabaseClient,
  query: StockTransferQuery,
): Promise<PaginatedResult<StockTransfer & { items?: StockTransferItem[] }>> {
  let q = supabase
    .from(TRANSFER_TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.fromBranchId) q = q.eq('from_branch_id', query.fromBranchId);
  if (query.toBranchId) q = q.eq('to_branch_id', query.toBranchId);
  if (query.status) q = q.eq('status', query.status);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'shippedAt': return 'shipped_at';
      case 'receivedAt': return 'received_at';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const transfers = (data ?? []) as StockTransfer[];
  const total = count ?? 0;

  // Load items for each transfer (batched).
  if (transfers.length > 0) {
    const transferIds = transfers.map((t) => t.id);
    const { data: items } = await supabase
      .from(ITEM_TABLE)
      .select('*')
      .in('transfer_id', transferIds)
      .is('deleted_at', null);
    const itemsByTransfer = new Map<string, StockTransferItem[]>();
    (items ?? []).forEach((item: StockTransferItem) => {
      const arr = itemsByTransfer.get(item.transfer_id) ?? [];
      arr.push(item);
      itemsByTransfer.set(item.transfer_id, arr);
    });
    transfers.forEach((t) => {
      (t as StockTransfer & { items?: StockTransferItem[] }).items = itemsByTransfer.get(t.id) ?? [];
    });
  }

  return {
    items: transfers as Array<StockTransfer & { items?: StockTransferItem[] }>,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

/** Get a single transfer with its items. */
export async function getTransfer(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<StockTransfer & { items: StockTransferItem[] }> {
  const { data: transfer, error } = await supabase
    .from(TRANSFER_TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!transfer) throw new AppError(ERROR_CODES.NOT_FOUND, 'التحويل غير موجود');

  const { data: items, error: itemsErr } = await supabase
    .from(ITEM_TABLE)
    .select('*')
    .eq('transfer_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (itemsErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, itemsErr.message);

  return {
    ...(transfer as StockTransfer),
    items: (items ?? []) as StockTransferItem[],
  };
}

/** Create a new transfer (status: draft). Stock NOT yet deducted. */
export async function createTransfer(
  supabase: LooseSupabaseClient,
  input: CreateStockTransferInput,
  actor: AccessTokenUser,
): Promise<StockTransfer & { items: StockTransferItem[] }> {
  if (input.fromBranchId === input.toBranchId) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن التحويل بين فرع ونفسه');
  }

  // Validate branches.
  const { data: branches } = await supabase
    .from('branches')
    .select('id, is_active')
    .in('id', [input.fromBranchId, input.toBranchId])
    .is('deleted_at', null);
  if (!branches || branches.length !== 2) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'فرع غير صالح');
  }
  if (!branches.every((b: { is_active: boolean }) => b.is_active)) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'أحد الفروع موقوف');
  }

  // Validate products exist.
  const productIds = input.items.map((i) => i.productId);
  const { data: products } = await supabase
    .from('products')
    .select('id, type, name')
    .in('id', productIds)
    .is('deleted_at', null);
  if (!products || products.length !== productIds.length) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'منتج غير موجود');
  }
  // Block IMEI products from transfers (devices are transferred individually).
  const imeiProducts = (products as Array<{ id: string; type: string; name: string }>).filter(
    (p) => p.type === 'imei',
  );
  if (imeiProducts.length > 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن تحويل منتجات IMEI كتحويل مخزون. استخدم تحويل أجهزة منفصل. المنتجات: ${imeiProducts.map((p) => p.name).join(', ')}`,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: transfer, error } = await supabase
    .from(TRANSFER_TABLE)
    .insert({
      id,
      from_branch_id: input.fromBranchId,
      to_branch_id: input.toBranchId,
      status: 'draft',
      total_items: input.items.length,
      notes: input.notes ?? null,
      user_id: actor.id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  // Insert items.
  const itemRows = input.items.map((item) => ({
    id: crypto.randomUUID(),
    transfer_id: id,
    product_id: item.productId,
    quantity: item.quantity,
    received_quantity: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  }));

  const { data: insertedItems, error: itemErr } = await supabase
    .from(ITEM_TABLE)
    .insert(itemRows)
    .select('*');

  if (itemErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, itemErr.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TRANSFER_TABLE,
    entityId: id,
    after: { fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, itemCount: input.items.length },
  });

  return {
    ...(transfer as StockTransfer),
    items: (insertedItems ?? []) as StockTransferItem[],
  };
}

/** Ship a transfer — deducts stock from source branch. */
export async function shipTransfer(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<StockTransfer> {
  const transfer = await getTransfer(supabase, id);

  if (transfer.status !== 'draft') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'يمكن شحن التحويلات في حالة draft فقط');
  }

  // Deduct stock for each item via movement service.
  for (const item of transfer.items) {
    await recordMovement(
      supabase,
      {
        productId: item.product_id,
        branchId: transfer.from_branch_id,
        type: 'transfer_out',
        quantity: -Math.abs(item.quantity),
        reason: `تحويل إلى فرع: ${transfer.to_branch_id}`,
        refType: 'stock_transfer',
        refId: id,
      },
      actor,
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from(TRANSFER_TABLE)
    .update({
      status: 'in_transit',
      shipped_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TRANSFER_TABLE,
    entityId: id,
    after: { action: 'shipped' },
  });

  return updated as StockTransfer;
}

/** Receive a transfer — adds stock to destination branch. */
export async function receiveTransfer(
  supabase: LooseSupabaseClient,
  id: string,
  input: ReceiveStockTransferInput,
  actor: AccessTokenUser,
): Promise<StockTransfer> {
  const transfer = await getTransfer(supabase, id);

  if (transfer.status !== 'in_transit') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'يمكن استلام التحويلات في حالة in_transit فقط');
  }

  // Default: receive all items fully.
  const receivedMap = new Map<string, number>();
  if (input.receivedItems) {
    input.receivedItems.forEach((ri) => receivedMap.set(ri.itemId, ri.receivedQuantity));
  }

  const now = new Date().toISOString();
  let allFullyReceived = true;

  for (const item of transfer.items) {
    const receivedQty = receivedMap.get(item.id) ?? item.quantity;
    const actualReceived = Math.min(receivedQty, item.quantity - item.received_quantity);

    if (actualReceived > 0) {
      await recordMovement(
        supabase,
        {
          productId: item.product_id,
          branchId: transfer.to_branch_id,
          type: 'transfer_in',
          quantity: actualReceived,
          reason: `استلام من فرع: ${transfer.from_branch_id}`,
          refType: 'stock_transfer',
          refId: id,
        },
        actor,
      );

      // Update item's received_quantity.
      await supabase
        .from(ITEM_TABLE)
        .update({
          received_quantity: item.received_quantity + actualReceived,
          updated_at: now,
        })
        .eq('id', item.id);
    }

    if (item.received_quantity + actualReceived < item.quantity) {
      allFullyReceived = false;
    }
  }

  // Update transfer status.
  const { data: updated, error } = await supabase
    .from(TRANSFER_TABLE)
    .update({
      status: allFullyReceived ? 'received' : 'in_transit', // partial stays in_transit
      received_at: allFullyReceived ? now : null,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TRANSFER_TABLE,
    entityId: id,
    after: { action: 'received', fully: allFullyReceived },
  });

  return updated as StockTransfer;
}

/** Cancel a transfer. If in_transit, return stock to source. */
export async function cancelTransfer(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<StockTransfer> {
  const transfer = await getTransfer(supabase, id);

  if (!['draft', 'in_transit'].includes(transfer.status)) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن إلغاء تحويل مكتمل');
  }

  // If in_transit, return stock to source.
  if (transfer.status === 'in_transit') {
    for (const item of transfer.items) {
      const unreceived = item.quantity - item.received_quantity;
      if (unreceived > 0) {
        await recordMovement(
          supabase,
          {
            productId: item.product_id,
            branchId: transfer.from_branch_id,
            type: 'transfer_in', // return to source
            quantity: unreceived,
            reason: `إلغاء تحويل: ${id}`,
            refType: 'stock_transfer',
            refId: id,
          },
          actor,
        );
      }
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from(TRANSFER_TABLE)
    .update({
      status: 'canceled',
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TRANSFER_TABLE,
    entityId: id,
    after: { action: 'canceled' },
  });

  return updated as StockTransfer;
}
