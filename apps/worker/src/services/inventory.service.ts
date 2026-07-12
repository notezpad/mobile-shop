/**
 * Inventory service — reads stock levels, low-stock, valuation.
 *
 * Notes:
 *  - Stock levels come from inventory_stocks (one row per product+branch).
 *  - For IMEI products, the system counts device_units in_stock.
 *  - This service is READ-ONLY. Writes go through stockMovement service.
 */
import {
  AppError,
  ERROR_CODES,
  type PaginatedResult,
  type StockLevelQuery,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';

export interface StockLevel {
  product_id: string;
  branch_id: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  min_quantity: number;
  max_quantity: number | null;
  product_name: string;
  product_sku: string;
  product_type: string;
  product_cost_price: number;
  product_sale_price: number;
  category_id: string | null;
  category_name: string | null;
  is_low_stock: boolean;
  stock_value_cost: number;
  stock_value_sale: number;
}

/** List stock levels with filters + pagination. */
export async function listStockLevels(
  supabase: LooseSupabaseClient,
  query: StockLevelQuery,
): Promise<PaginatedResult<StockLevel>> {
  // Use the v_inventory_stock_levels view (created in migration 0005).
  let q = supabase
    .from('v_inventory_stock_levels')
    .select('*', { count: 'exact' });

  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.productId) q = q.eq('product_id', query.productId);
  if (query.categoryId) q = q.eq('category_id', query.categoryId);
  if (query.lowStock === 'true') q = q.eq('is_low_stock', true);
  if (query.lowStock === 'false') q = q.eq('is_low_stock', false);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'product': return 'product_name';
      case 'quantity': return 'available_quantity';
      case 'value': return 'stock_value_cost';
      default: return 'updated_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const items = (data ?? []) as unknown as StockLevel[];
  const total = count ?? 0;

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

/** Get stock summary for a branch (or all branches). */
export async function getStockSummary(
  supabase: LooseSupabaseClient,
  branchId?: string,
): Promise<{
  totalProducts: number;
  totalUnits: number;
  totalValueCost: number;
  totalValueSale: number;
  lowStockCount: number;
  outOfStockCount: number;
}> {
  let q = supabase.from('v_inventory_stock_levels').select(
    'quantity, stock_value_cost, stock_value_sale, is_low_stock, available_quantity',
  );
  if (branchId) q = q.eq('branch_id', branchId);

  const { data, error } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const rows = (data ?? []) as Array<{
    quantity: number;
    stock_value_cost: number;
    stock_value_sale: number;
    is_low_stock: boolean;
    available_quantity: number;
  }>;

  return {
    totalProducts: rows.length,
    totalUnits: rows.reduce((sum, r) => sum + r.quantity, 0),
    totalValueCost: rows.reduce((sum, r) => sum + (r.stock_value_cost ?? 0), 0),
    totalValueSale: rows.reduce((sum, r) => sum + (r.stock_value_sale ?? 0), 0),
    lowStockCount: rows.filter((r) => r.is_low_stock).length,
    outOfStockCount: rows.filter((r) => r.available_quantity <= 0).length,
  };
}
