import type { BaseEntity, UUID } from './base';

/** Type of stock movement — determines sign convention in calculations. */
export type StockMovementType =
  | 'purchase' // +qty (from supplier)
  | 'sale' // -qty (to customer)
  | 'return_in' // +qty (customer return)
  | 'return_out' // -qty (return to supplier)
  | 'transfer_in' // +qty (from another branch)
  | 'transfer_out' // -qty (to another branch)
  | 'adjustment' // ±qty (manual stocktake)
  | 'repair_in' // +qty (parts returned from repair)
  | 'repair_out'; // -qty (parts used in repair)

export interface InventoryStock extends BaseEntity {
  product_id: UUID;
  branch_id: UUID;
  quantity: number;
  /** Committed (reserved) for pending sales — not available for new sales. */
  reserved_quantity: number;
  min_quantity: number;
  max_quantity: number | null;
}

export interface StockMovement extends BaseEntity {
  product_id: UUID;
  branch_id: UUID;
  type: StockMovementType;
  /** Signed quantity (positive for inbound, negative for outbound). */
  quantity: number;
  /** Balance after this movement — for audit trail. */
  balance_after: number;
  reason: string | null;
  /** Reference to the source entity (sale, repair, transfer, purchase…). */
  ref_type: string | null;
  ref_id: UUID | null;
  user_id: UUID;
}

/** Stock transfer between branches. */
export type TransferStatus = 'draft' | 'in_transit' | 'received' | 'canceled';

export interface StockTransfer extends BaseEntity {
  from_branch_id: UUID;
  to_branch_id: UUID;
  status: TransferStatus;
  total_items: number;
  notes: string | null;
  user_id: UUID;
  shipped_at: string | null;
  received_at: string | null;
}

export interface StockTransferItem extends BaseEntity {
  transfer_id: UUID;
  product_id: UUID;
  quantity: number;
  received_quantity: number;
}
