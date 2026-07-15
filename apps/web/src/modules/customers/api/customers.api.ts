/**
 * Customers API client.
 */
import { api } from '@core/db/api-client';
import type {
  Customer,
  PaginatedResult,
  CustomerTransaction,
  CustomerPayment,
  CreateCustomerInput,
  UpdateCustomerInput,
  AdjustCustomerBalanceInput,
  RecordCustomerPaymentInput,
  CustomerQuery,
} from '@mobile-shop/shared';

export interface CustomerStats {
  totalPurchases: number;
  totalRepairs: number;
  outstandingBalance: number;
  lastPurchaseAt: string | null;
  lastRepairAt: string | null;
}

export const customersApi = {
  list(query: CustomerQuery): Promise<PaginatedResult<Customer>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.isActive) params.set('isActive', query.isActive);
    if (query.hasBalance) params.set('hasBalance', query.hasBalance);
    return api.get(`/customers?${params.toString()}`);
  },

  get(id: string): Promise<Customer> {
    return api.get(`/customers/${id}`);
  },

  getTransactions(
    id: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResult<CustomerTransaction>> {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return api.get(`/customers/${id}/transactions?${params.toString()}`);
  },

  getStats(id: string): Promise<CustomerStats> {
    return api.get(`/customers/${id}/stats`);
  },

  create(input: CreateCustomerInput): Promise<Customer> {
    return api.post(`/customers`, input);
  },

  update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    return api.patch(`/customers/${id}`, input);
  },

  adjustBalance(id: string, input: AdjustCustomerBalanceInput): Promise<Customer> {
    return api.post(`/customers/${id}/adjust-balance`, input);
  },

  /**
   * Record a customer payment — reduces balance + adds to cashbox.
   * Used for "running tab" / installment scenarios.
   */
  recordPayment(
    id: string,
    input: RecordCustomerPaymentInput,
  ): Promise<{ payment: CustomerPayment; customer: Customer }> {
    return api.post(`/customers/${id}/payments`, input);
  },

  delete(id: string): Promise<null> {
    return api.delete(`/customers/${id}`);
  },
};
