/**
 * Reports API client + hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@core/db/api-client';
import { useAuthStore } from '@stores/auth.store';
import { useMemo } from 'react';

export interface DashboardOverview {
  sales: { todayCount: number; todayTotal: number; weekTotal: number; monthTotal: number; avgTicket: number };
  repairs: { activeCount: number; readyCount: number; todayReceived: number; todayDelivered: number };
  inventory: { totalProducts: number; lowStockCount: number; totalValue: number };
  finance: { todayExpenses: number; todayRevenues: number; netProfit: number };
  customers: { totalCustomers: number; newToday: number };
}

export interface SalesReport {
  summary: { totalSales: number; totalTransactions: number; avgTicket: number; totalDiscount: number; totalTax: number; totalRefunds: number; netSales: number };
  byDay: Array<{ date: string; total: number; count: number }>;
  byPaymentMethod: Array<{ method: string; total: number; count: number }>;
  byCashier: Array<{ cashierId: string; cashierName: string; total: number; count: number }>;
  topProducts: Array<{ productId: string; productName: string; quantity: number; total: number }>;
}

export interface InventoryReport {
  summary: { totalProducts: number; totalUnits: number; totalValueCost: number; totalValueSale: number; lowStockCount: number; outOfStockCount: number };
  byCategory: Array<{ categoryName: string; productCount: number; stockValue: number }>;
  lowStock: Array<{ productName: string; sku: string; branchName: string; available: number; minQuantity: number }>;
  recentMovements: Array<{ type: string; quantity: number; productName: string; branchName: string; createdAt: string }>;
}

export interface RepairsReport {
  summary: { totalRepairs: number; completed: number; active: number; canceled: number; totalRevenue: number; avgRepairTime: number };
  byStatus: Array<{ status: string; count: number }>;
  byTechnician: Array<{ technicianName: string; count: number; revenue: number }>;
  byDay: Array<{ date: string; received: number; delivered: number }>;
}

export interface FinanceReport {
  summary: { totalRevenues: number; totalExpenses: number; netProfit: number; profitMargin: number };
  expensesByCategory: Array<{ categoryName: string; total: number; count: number }>;
  revenuesByCategory: Array<{ categoryName: string; total: number; count: number }>;
  dailyPnL: Array<{ date: string; revenues: number; expenses: number; net: number }>;
}

function buildParams(branchId?: string, fromDate?: string, toDate?: string) {
  const p = new URLSearchParams();
  if (branchId) p.set('branchId', branchId);
  if (fromDate) p.set('fromDate', fromDate);
  if (toDate) p.set('toDate', toDate);
  return p.toString();
}

export function useDashboardOverview() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roleKey === 'super_admin' || user?.roleKey === 'admin';
  const branchId = isAdmin ? undefined : user?.branchId ?? undefined;
  return useQuery({
    queryKey: ['report', 'dashboard', branchId],
    queryFn: () => api.get<DashboardOverview>(`/reports/dashboard?${buildParams(branchId)}`),
    staleTime: 60_000,
  });
}

export function useSalesReport(fromDate?: string, toDate?: string) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roleKey === 'super_admin' || user?.roleKey === 'admin';
  const branchId = isAdmin ? undefined : user?.branchId ?? undefined;
  return useQuery({
    queryKey: ['report', 'sales', branchId, fromDate, toDate],
    queryFn: () => api.get<SalesReport>(`/reports/sales?${buildParams(branchId, fromDate, toDate)}`),
    staleTime: 60_000,
  });
}

export function useInventoryReport() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roleKey === 'super_admin' || user?.roleKey === 'admin';
  const branchId = isAdmin ? undefined : user?.branchId ?? undefined;
  return useQuery({
    queryKey: ['report', 'inventory', branchId],
    queryFn: () => api.get<InventoryReport>(`/reports/inventory?${buildParams(branchId)}`),
    staleTime: 60_000,
  });
}

export function useRepairsReport(fromDate?: string, toDate?: string) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roleKey === 'super_admin' || user?.roleKey === 'admin';
  const branchId = isAdmin ? undefined : user?.branchId ?? undefined;
  return useQuery({
    queryKey: ['report', 'repairs', branchId, fromDate, toDate],
    queryFn: () => api.get<RepairsReport>(`/reports/repairs?${buildParams(branchId, fromDate, toDate)}`),
    staleTime: 60_000,
  });
}

export function useFinanceReport(fromDate?: string, toDate?: string) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roleKey === 'super_admin' || user?.roleKey === 'admin';
  const branchId = isAdmin ? undefined : user?.branchId ?? undefined;
  return useQuery({
    queryKey: ['report', 'finance', branchId, fromDate, toDate],
    queryFn: () => api.get<FinanceReport>(`/reports/finance?${buildParams(branchId, fromDate, toDate)}`),
    staleTime: 60_000,
  });
}
