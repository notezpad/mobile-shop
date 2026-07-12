/**
 * Finance API client + hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { api, API_PREFIX } from '@core/db/api-client';
import type {
  Cashbox,
  CashboxTransaction,
  Expense,
  Revenue,
  ExpenseCategory,
  RevenueCategory,
  PaymentMethod,
  PaginatedResult,
  OpenCashboxInput,
  CloseCashboxInput,
  CashboxQuery,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseQuery,
  CreateRevenueInput,
  UpdateRevenueInput,
  RevenueQuery,
  CreateExpenseCategoryInput,
  CreateRevenueCategoryInput,
  UpdatePaymentMethodInput,
} from '@mobile-shop/shared';

export const cashboxApi = {
  getCurrent: () => api.get<Cashbox | null>(`${API_PREFIX}/cashboxes/current`),
  list: (q: CashboxQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sortBy: q.sortBy, sortDir: q.sortDir });
    if (q.branchId) p.set('branchId', q.branchId);
    if (q.userId) p.set('userId', q.userId);
    if (q.status) p.set('status', q.status);
    return api.get<PaginatedResult<Cashbox>>(`${API_PREFIX}/cashboxes?${p}`);
  },
  getTransactions: (id: string) => api.get<CashboxTransaction[]>(`${API_PREFIX}/cashboxes/${id}/transactions`),
  open: (input: OpenCashboxInput) => api.post<Cashbox>(`${API_PREFIX}/cashboxes/open`, input),
  close: (id: string, input: CloseCashboxInput) => api.post<Cashbox>(`${API_PREFIX}/cashboxes/${id}/close`, input),
};

export const expenseApi = {
  list: (q: ExpenseQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sortBy: q.sortBy, sortDir: q.sortDir });
    if (q.branchId) p.set('branchId', q.branchId);
    if (q.categoryId) p.set('categoryId', q.categoryId);
    if (q.paymentMethod) p.set('paymentMethod', q.paymentMethod);
    if (q.fromDate) p.set('fromDate', q.fromDate);
    if (q.toDate) p.set('toDate', q.toDate);
    if (q.search) p.set('search', q.search);
    return api.get<PaginatedResult<Expense & { category_name?: string; user_name?: string; branch_name?: string }>>(`${API_PREFIX}/expenses?${p}`);
  },
  listCategories: () => api.get<ExpenseCategory[]>(`${API_PREFIX}/expenses/categories`),
  createCategory: (input: CreateExpenseCategoryInput) => api.post<ExpenseCategory>(`${API_PREFIX}/expenses/categories`, input),
  create: (input: CreateExpenseInput) => api.post<Expense>(`${API_PREFIX}/expenses`, input),
  update: (id: string, input: UpdateExpenseInput) => api.patch<Expense>(`${API_PREFIX}/expenses/${id}`, input),
  delete: (id: string) => api.delete<null>(`${API_PREFIX}/expenses/${id}`),
};

export const revenueApi = {
  list: (q: RevenueQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sortBy: q.sortBy, sortDir: q.sortDir });
    if (q.branchId) p.set('branchId', q.branchId);
    if (q.categoryId) p.set('categoryId', q.categoryId);
    if (q.paymentMethod) p.set('paymentMethod', q.paymentMethod);
    if (q.fromDate) p.set('fromDate', q.fromDate);
    if (q.toDate) p.set('toDate', q.toDate);
    if (q.search) p.set('search', q.search);
    return api.get<PaginatedResult<Revenue & { category_name?: string; user_name?: string; branch_name?: string }>>(`${API_PREFIX}/revenues?${p}`);
  },
  listCategories: () => api.get<RevenueCategory[]>(`${API_PREFIX}/revenues/categories`),
  createCategory: (input: CreateRevenueCategoryInput) => api.post<RevenueCategory>(`${API_PREFIX}/revenues/categories`, input),
  create: (input: CreateRevenueInput) => api.post<Revenue>(`${API_PREFIX}/revenues`, input),
  update: (id: string, input: UpdateRevenueInput) => api.patch<Revenue>(`${API_PREFIX}/revenues/${id}`, input),
  delete: (id: string) => api.delete<null>(`${API_PREFIX}/revenues/${id}`),
};

export const paymentMethodApi = {
  list: () => api.get<PaymentMethod[]>(`${API_PREFIX}/payment-methods`),
  update: (id: string, input: UpdatePaymentMethodInput) => api.patch<PaymentMethod>(`${API_PREFIX}/payment-methods/${id}`, input),
};

export const financeApi = {
  getSummary: (branchId?: string, fromDate?: string, toDate?: string) => {
    const p = new URLSearchParams();
    if (branchId) p.set('branchId', branchId);
    if (fromDate) p.set('fromDate', fromDate);
    if (toDate) p.set('toDate', toDate);
    const qs = p.toString();
    return api.get<{
      totalExpenses: number;
      totalRevenues: number;
      netProfit: number;
      expenseCount: number;
      revenueCount: number;
    }>(`${API_PREFIX}/finance/summary${qs ? `?${qs}` : ''}`);
  },
};

// ─── Hooks ────────────────────────────────────────────────────────

export function useCurrentCashbox() {
  return useQuery({ queryKey: ['cashbox', 'current'], queryFn: cashboxApi.getCurrent, staleTime: 30_000 });
}

export function useExpenseCategories() {
  return useQuery({ queryKey: ['expense-categories'], queryFn: expenseApi.listCategories, staleTime: 5 * 60_000 });
}

export function useRevenueCategories() {
  return useQuery({ queryKey: ['revenue-categories'], queryFn: revenueApi.listCategories, staleTime: 5 * 60_000 });
}

export function usePaymentMethods() {
  return useQuery({ queryKey: ['payment-methods'], queryFn: paymentMethodApi.list, staleTime: 5 * 60_000 });
}

export function useFinanceSummary(branchId?: string, fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ['finance-summary', branchId, fromDate, toDate],
    queryFn: () => financeApi.getSummary(branchId, fromDate, toDate),
    staleTime: 60_000,
  });
}
