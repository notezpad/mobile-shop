/**
 * Sales API client.
 */
import { api } from '@core/db/api-client';
import type {
  SaleWithDetails,
  PaginatedResult,
  CreateSaleInput,
  SaleQuery,
  VoidSaleInput,
} from '@mobile-shop/shared';

export const salesApi = {
  list(query: SaleQuery): Promise<PaginatedResult<SaleWithDetails>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.customerId) params.set('customerId', query.customerId);
    if (query.cashierId) params.set('cashierId', query.cashierId);
    if (query.status) params.set('status', query.status);
    if (query.paymentMethod) params.set('paymentMethod', query.paymentMethod);
    if (query.fromDate) params.set('fromDate', query.fromDate);
    if (query.toDate) params.set('toDate', query.toDate);
    return api.get(`/sales?${params.toString()}`);
  },

  get(id: string): Promise<SaleWithDetails> {
    return api.get(`/sales/${id}`);
  },

  create(input: CreateSaleInput): Promise<SaleWithDetails> {
    return api.post(`/sales`, input);
  },

  void(id: string, input: VoidSaleInput): Promise<unknown> {
    return api.post(`/sales/${id}/void`, input);
  },
};
