/**
 * Returns API client + hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { api, API_PREFIX } from '@core/db/api-client';
import type {
  ReturnWithDetails,
  PaginatedResult,
  CreateReturnInput,
  ReturnQuery,
} from '@mobile-shop/shared';

export const returnsApi = {
  list(query: ReturnQuery): Promise<PaginatedResult<ReturnWithDetails>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.saleId) params.set('saleId', query.saleId);
    if (query.customerId) params.set('customerId', query.customerId);
    if (query.status) params.set('status', query.status);
    if (query.fromDate) params.set('fromDate', query.fromDate);
    if (query.toDate) params.set('toDate', query.toDate);
    return api.get(`${API_PREFIX}/returns?${params.toString()}`);
  },

  get(id: string): Promise<ReturnWithDetails> {
    return api.get(`${API_PREFIX}/returns/${id}`);
  },

  create(input: CreateReturnInput): Promise<ReturnWithDetails> {
    return api.post(`${API_PREFIX}/returns`, input);
  },

  approve(id: string): Promise<ReturnWithDetails> {
    return api.post(`${API_PREFIX}/returns/${id}/approve`, {});
  },

  reject(id: string): Promise<ReturnWithDetails> {
    return api.post(`${API_PREFIX}/returns/${id}/reject`, {});
  },
};

/** Returns list. */
export function useReturns(query: ReturnQuery) {
  return useQuery({
    queryKey: ['returns', query],
    queryFn: () => returnsApi.list(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Single return. */
export function useReturn(id?: string | null) {
  return useQuery({
    queryKey: ['return', id],
    queryFn: () => returnsApi.get(id!),
    enabled: !!id,
  });
}

export type { ReturnWithDetails };
