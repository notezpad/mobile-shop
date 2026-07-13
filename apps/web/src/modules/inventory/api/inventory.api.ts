/**
 * Inventory API client.
 */
import { api } from '@core/db/api-client';
import type {
  StockMovement,
  StockLevelQuery,
  StockMovementQuery,
  BatchStockAdjustmentInput,
  StockTransfer,
  StockTransferItem,
  CreateStockTransferInput,
  ReceiveStockTransferInput,
  StockTransferQuery,
} from '@mobile-shop/shared';
import type { StockLevel } from '../hooks/useInventory';

export interface StockSummary {
  totalProducts: number;
  totalUnits: number;
  totalValueCost: number;
  totalValueSale: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const inventoryApi = {
  listStockLevels(query: StockLevelQuery): Promise<PaginatedResult<StockLevel>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.productId) params.set('productId', query.productId);
    if (query.categoryId) params.set('categoryId', query.categoryId);
    if (query.lowStock) params.set('lowStock', query.lowStock);
    return api.get(`/inventory?${params.toString()}`);
  },

  getSummary(branchId?: string): Promise<StockSummary> {
    const params = new URLSearchParams();
    if (branchId) params.set('branchId', branchId);
    const qs = params.toString();
    return api.get(`/inventory/summary${qs ? `?${qs}` : ''}`);
  },

  listMovements(query: StockMovementQuery): Promise<PaginatedResult<StockMovement>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.productId) params.set('productId', query.productId);
    if (query.type) params.set('type', query.type);
    if (query.refType) params.set('refType', query.refType);
    if (query.refId) params.set('refId', query.refId);
    if (query.fromDate) params.set('fromDate', query.fromDate);
    if (query.toDate) params.set('toDate', query.toDate);
    return api.get(`/inventory/movements?${params.toString()}`);
  },

  recordAdjustments(input: BatchStockAdjustmentInput): Promise<StockMovement[]> {
    return api.post(`/inventory/adjustments`, input);
  },
};

export const stockTransfersApi = {
  list(query: StockTransferQuery): Promise<PaginatedResult<StockTransfer & { items?: StockTransferItem[] }>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.fromBranchId) params.set('fromBranchId', query.fromBranchId);
    if (query.toBranchId) params.set('toBranchId', query.toBranchId);
    if (query.status) params.set('status', query.status);
    return api.get(`/stock-transfers?${params.toString()}`);
  },

  get(id: string): Promise<StockTransfer & { items: StockTransferItem[] }> {
    return api.get(`/stock-transfers/${id}`);
  },

  create(input: CreateStockTransferInput): Promise<StockTransfer & { items: StockTransferItem[] }> {
    return api.post(`/stock-transfers`, input);
  },

  ship(id: string): Promise<StockTransfer> {
    return api.post(`/stock-transfers/${id}/ship`, {});
  },

  receive(id: string, input: ReceiveStockTransferInput): Promise<StockTransfer> {
    return api.post(`/stock-transfers/${id}/receive`, input);
  },

  cancel(id: string): Promise<StockTransfer> {
    return api.post(`/stock-transfers/${id}/cancel`, {});
  },
};
