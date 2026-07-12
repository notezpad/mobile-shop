/**
 * Customer hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { customersApi, type CustomerStats } from '../api/customers.api';
import type { Customer, CustomerQuery, CustomerTransaction } from '@mobile-shop/shared';

/** Customers list with filters. */
export function useCustomers(query: CustomerQuery) {
  return useQuery({
    queryKey: ['customers', query],
    queryFn: () => customersApi.list(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Single customer. */
export function useCustomer(id?: string | null) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id!),
    enabled: !!id,
  });
}

/** Customer transactions (timeline). */
export function useCustomerTransactions(id?: string | null, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['customer-transactions', id, page, pageSize],
    queryFn: () => customersApi.getTransactions(id!, page, pageSize),
    enabled: !!id,
  });
}

/** Customer stats. */
export function useCustomerStats(id?: string | null) {
  return useQuery({
    queryKey: ['customer-stats', id],
    queryFn: () => customersApi.getStats(id!),
    enabled: !!id,
  });
}

/** Quick customer search by phone — used in POS. */
export function useCustomerSearch(search: string) {
  return useQuery({
    queryKey: ['customers', 'search', search],
    queryFn: () =>
      customersApi.list({
        page: 1,
        pageSize: 10,
        search,
        sortBy: 'name',
        sortDir: 'asc',
      }),
    enabled: search.trim().length >= 2,
    staleTime: 10_000,
  });
}

export type { Customer, CustomerTransaction, CustomerStats };
