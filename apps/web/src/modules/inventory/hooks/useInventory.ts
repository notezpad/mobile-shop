/**
 * Inventory hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { inventoryApi, stockTransfersApi, type StockSummary, type PaginatedResult } from '../api/inventory.api';
import type {
  StockLevelQuery,
  StockMovementQuery,
  StockTransferQuery,
  StockMovement,
  StockTransfer,
  StockTransferItem,
} from '@mobile-shop/shared';

export interface StockLevel {
  stock_id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  min_quantity: number;
  max_quantity: number | null;
  updated_at: string;
  product_name: string;
  product_sku: string;
  product_barcode: string | null;
  product_type: string;
  product_cost_price: number;
  product_sale_price: number;
  category_id: string | null;
  category_name: string | null;
  product_min_quantity: number;
  is_low_stock: boolean;
  stock_value_cost: number;
  stock_value_sale: number;
}

/** Stock levels list with filters. */
export function useStockLevels(query: StockLevelQuery) {
  return useQuery({
    queryKey: ['inventory', 'stock-levels', query],
    queryFn: () => inventoryApi.listStockLevels(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Stock summary KPIs. */
export function useStockSummary(branchId?: string) {
  return useQuery({
    queryKey: ['inventory', 'summary', branchId],
    queryFn: () => inventoryApi.getSummary(branchId),
    staleTime: 60_000,
  });
}

/** Movement history. */
export function useStockMovements(query: StockMovementQuery) {
  return useQuery({
    queryKey: ['inventory', 'movements', query],
    queryFn: () => inventoryApi.listMovements(query),
    placeholderData: (prev) => prev,
  });
}

/** Stock transfers list. */
export function useStockTransfers(query: StockTransferQuery) {
  return useQuery({
    queryKey: ['stock-transfers', query],
    queryFn: () => stockTransfersApi.list(query),
    placeholderData: (prev) => prev,
  });
}

/** Single transfer with items. */
export function useStockTransfer(id?: string | null) {
  return useQuery({
    queryKey: ['stock-transfer', id],
    queryFn: () => stockTransfersApi.get(id!),
    enabled: !!id,
  });
}

// Re-export types for convenience.
export type { StockSummary, PaginatedResult, StockMovement, StockTransfer, StockTransferItem };
