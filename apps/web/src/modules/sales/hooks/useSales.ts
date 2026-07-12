/**
 * Sales hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '../api/sales.api';
import type { SaleQuery, SaleWithDetails } from '@mobile-shop/shared';

/** Sales list. */
export function useSales(query: SaleQuery) {
  return useQuery({
    queryKey: ['sales', query],
    queryFn: () => salesApi.list(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Single sale with details. */
export function useSale(id?: string | null) {
  return useQuery({
    queryKey: ['sale', id],
    queryFn: () => salesApi.get(id!),
    enabled: !!id,
  });
}

export type { SaleWithDetails };
