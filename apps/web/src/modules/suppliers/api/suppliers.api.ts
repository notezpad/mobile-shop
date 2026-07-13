/**
 * Suppliers API client + hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@core/db/api-client';
import type {
  Supplier,
  PaginatedResult,
  CreateSupplierInput,
  UpdateSupplierInput,
  AdjustSupplierBalanceInput,
  SupplierQuery,
} from '@mobile-shop/shared';

export const suppliersApi = {
  list(query: SupplierQuery): Promise<PaginatedResult<Supplier>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.isActive) params.set('isActive', query.isActive);
    if (query.hasBalance) params.set('hasBalance', query.hasBalance);
    return api.get(`/suppliers?${params.toString()}`);
  },

  get(id: string): Promise<Supplier> {
    return api.get(`/suppliers/${id}`);
  },

  create(input: CreateSupplierInput): Promise<Supplier> {
    return api.post(`/suppliers`, input);
  },

  update(id: string, input: UpdateSupplierInput): Promise<Supplier> {
    return api.patch(`/suppliers/${id}`, input);
  },

  adjustBalance(id: string, input: AdjustSupplierBalanceInput): Promise<Supplier> {
    return api.post(`/suppliers/${id}/adjust-balance`, input);
  },

  delete(id: string): Promise<null> {
    return api.delete(`/suppliers/${id}`);
  },
};

/** Suppliers list. */
export function useSuppliers(query: SupplierQuery) {
  return useQuery({
    queryKey: ['suppliers', query],
    queryFn: () => suppliersApi.list(query),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

/** Single supplier. */
export function useSupplier(id?: string | null) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: () => suppliersApi.get(id!),
    enabled: !!id,
  });
}
