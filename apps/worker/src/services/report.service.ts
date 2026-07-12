/**
 * Report service — aggregated data for dashboard + reports module.
 *
 * All reports support:
 *  - branchId filter (optional — super_admin sees all)
 *  - date range (fromDate / toDate)
 *  - Returns ready-to-chart data (arrays of {label, value} or similar)
 */
import { AppError, ERROR_CODES } from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';

export interface DateRange {
  fromDate?: string;
  toDate?: string;
}

// ─── Dashboard overview ───────────────────────────────────────────

export interface DashboardOverview {
  sales: {
    todayCount: number;
    todayTotal: number;
    weekTotal: number;
    monthTotal: number;
    avgTicket: number;
  };
  repairs: {
    activeCount: number;
    readyCount: number;
    todayReceived: number;
    todayDelivered: number;
  };
  inventory: {
    totalProducts: number;
    lowStockCount: number;
    totalValue: number;
  };
  finance: {
    todayExpenses: number;
    todayRevenues: number;
    netProfit: number;
  };
  customers: {
    totalCustomers: number;
    newToday: number;
  };
}

export async function getDashboardOverview(
  supabase: LooseSupabaseClient,
  branchId?: string | null,
): Promise<DashboardOverview> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Sales
  let salesQuery = supabase.from('sales').select('total, created_at').eq('status', 'completed').is('deleted_at', null);
  if (branchId) salesQuery = salesQuery.eq('branch_id', branchId);
  const { data: salesData } = await salesQuery;
  const sales = (salesData ?? []) as Array<{ total: number; created_at: string }>;
  const todaySales = sales.filter((s) => s.created_at >= todayStart);
  const weekSales = sales.filter((s) => s.created_at >= weekAgo);
  const monthSales = sales.filter((s) => s.created_at >= monthAgo);

  // Repairs
  let repairQuery = supabase.from('repairs').select('status, received_at, delivered_at').is('deleted_at', null);
  if (branchId) repairQuery = repairQuery.eq('branch_id', branchId);
  const { data: repairsData } = await repairQuery;
  const repairs = (repairsData ?? []) as Array<{ status: string; received_at: string; delivered_at: string | null }>;
  const activeRepairs = repairs.filter((r) => !['delivered', 'canceled'].includes(r.status));
  const readyRepairs = repairs.filter((r) => r.status === 'ready');
  const todayReceived = repairs.filter((r) => r.received_at >= todayStart);
  const todayDelivered = repairs.filter((r) => r.delivered_at && r.delivered_at >= todayStart);

  // Inventory
  let invQuery = supabase.from('v_inventory_stock_levels').select('is_low_stock, stock_value_cost');
  if (branchId) invQuery = invQuery.eq('branch_id', branchId);
  const { data: invData } = await invQuery;
  const inv = (invData ?? []) as Array<{ is_low_stock: boolean; stock_value_cost: number }>;

  // Finance
  let expQuery = supabase.from('expenses').select('amount, date').is('deleted_at', null);
  let revQuery = supabase.from('revenues').select('amount, date').is('deleted_at', null);
  if (branchId) {
    expQuery = expQuery.eq('branch_id', branchId);
    revQuery = revQuery.eq('branch_id', branchId);
  }
  const [expResult, revResult] = await Promise.all([expQuery, revQuery]);
  const expenses = ((expResult.data ?? []) as Array<{ amount: number; date: string }>).filter((e) => e.date >= todayStart.split('T')[0]!);
  const revenues = ((revResult.data ?? []) as Array<{ amount: number; date: string }>).filter((r) => r.date >= todayStart.split('T')[0]!);

  // Customers
  const { count: customerCount } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  const { count: newCustomersToday } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart)
    .is('deleted_at', null);

  return {
    sales: {
      todayCount: todaySales.length,
      todayTotal: todaySales.reduce((s, x) => s + x.total, 0),
      weekTotal: weekSales.reduce((s, x) => s + x.total, 0),
      monthTotal: monthSales.reduce((s, x) => s + x.total, 0),
      avgTicket: todaySales.length > 0 ? todaySales.reduce((s, x) => s + x.total, 0) / todaySales.length : 0,
    },
    repairs: {
      activeCount: activeRepairs.length,
      readyCount: readyRepairs.length,
      todayReceived: todayReceived.length,
      todayDelivered: todayDelivered.length,
    },
    inventory: {
      totalProducts: inv.length,
      lowStockCount: inv.filter((i) => i.is_low_stock).length,
      totalValue: inv.reduce((s, i) => s + (i.stock_value_cost ?? 0), 0),
    },
    finance: {
      todayExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      todayRevenues: revenues.reduce((s, r) => s + r.amount, 0),
      netProfit: revenues.reduce((s, r) => s + r.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0),
    },
    customers: {
      totalCustomers: customerCount ?? 0,
      newToday: newCustomersToday ?? 0,
    },
  };
}

// ─── Sales report ─────────────────────────────────────────────────

export interface SalesReport {
  summary: {
    totalSales: number;
    totalTransactions: number;
    avgTicket: number;
    totalDiscount: number;
    totalTax: number;
    totalRefunds: number;
    netSales: number;
  };
  byDay: Array<{ date: string; total: number; count: number }>;
  byPaymentMethod: Array<{ method: string; total: number; count: number }>;
  byCashier: Array<{ cashierId: string; cashierName: string; total: number; count: number }>;
  topProducts: Array<{ productId: string; productName: string; quantity: number; total: number }>;
}

export async function getSalesReport(
  supabase: LooseSupabaseClient,
  branchId?: string | null,
  range?: DateRange,
): Promise<SalesReport> {
  let q = supabase
    .from('sales')
    .select('id, invoice_no, total, discount, tax, payment_method, cashier_id, created_at, status')
    .eq('status', 'completed')
    .is('deleted_at', null);
  if (branchId) q = q.eq('branch_id', branchId);
  if (range?.fromDate) q = q.gte('created_at', range.fromDate);
  if (range?.toDate) q = q.lte('created_at', range.toDate);
  const { data: salesRaw, error } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const sales = (salesRaw ?? []) as Array<{
    id: string; total: number; discount: number; tax: number;
    payment_method: string; cashier_id: string; created_at: string;
  }>;

  // Summary
  const totalSales = sales.reduce((s, x) => s + x.total, 0);
  const totalDiscount = sales.reduce((s, x) => s + x.discount, 0);
  const totalTax = sales.reduce((s, x) => s + x.tax, 0);

  // By day
  const dayMap = new Map<string, { total: number; count: number }>();
  sales.forEach((s) => {
    const day = s.created_at.split('T')[0]!;
    const existing = dayMap.get(day) ?? { total: 0, count: 0 };
    existing.total += s.total;
    existing.count += 1;
    dayMap.set(day, existing);
  });
  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // By payment method
  const methodMap = new Map<string, { total: number; count: number }>();
  sales.forEach((s) => {
    const existing = methodMap.get(s.payment_method) ?? { total: 0, count: 0 };
    existing.total += s.total;
    existing.count += 1;
    methodMap.set(s.payment_method, existing);
  });
  const byPaymentMethod = Array.from(methodMap.entries()).map(([method, v]) => ({ method, ...v }));

  // By cashier — load names
  const cashierIds = [...new Set(sales.map((s) => s.cashier_id))];
  let cashierNames = new Map<string, string>();
  if (cashierIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', cashierIds);
    (users ?? []).forEach((u: { id: string; full_name: string }) => cashierNames.set(u.id, u.full_name));
  }
  const cashierMap = new Map<string, { total: number; count: number }>();
  sales.forEach((s) => {
    const existing = cashierMap.get(s.cashier_id) ?? { total: 0, count: 0 };
    existing.total += s.total;
    existing.count += 1;
    cashierMap.set(s.cashier_id, existing);
  });
  const byCashier = Array.from(cashierMap.entries()).map(([cashierId, v]) => ({
    cashierId,
    cashierName: cashierNames.get(cashierId) ?? '—',
    ...v,
  }));

  // Top products
  let itemQ = supabase
    .from('sale_items')
    .select('product_id, quantity, total, sale:sales!inner(status, deleted_at, created_at)')
    .eq('sale.status', 'completed')
    .is('sale.deleted_at', null)
    .is('deleted_at', null);
  if (branchId) itemQ = itemQ.eq('sale.branch_id', branchId);
  if (range?.fromDate) itemQ = itemQ.gte('sale.created_at', range.fromDate);
  if (range?.toDate) itemQ = itemQ.lte('sale.created_at', range.toDate);
  const { data: itemsRaw } = await itemQ;
  const items = (itemsRaw ?? []) as unknown as Array<{
    product_id: string; quantity: number; total: number;
    sale: { status: string };
  }>;
  const productMap = new Map<string, { quantity: number; total: number }>();
  items.forEach((i) => {
    const existing = productMap.get(i.product_id) ?? { quantity: 0, total: 0 };
    existing.quantity += i.quantity;
    existing.total += i.total;
    productMap.set(i.product_id, existing);
  });
  const productIds = [...new Set(items.map((i) => i.product_id))];
  let productNames = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from('products').select('id, name').in('id', productIds);
    (products ?? []).forEach((p: { id: string; name: string }) => productNames.set(p.id, p.name));
  }
  const topProducts = Array.from(productMap.entries())
    .map(([productId, v]) => ({ productId, productName: productNames.get(productId) ?? '—', ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Refunds
  let retQ = supabase.from('returns').select('total').eq('status', 'completed').is('deleted_at', null);
  if (branchId) retQ = retQ.eq('branch_id', branchId);
  if (range?.fromDate) retQ = retQ.gte('created_at', range.fromDate);
  if (range?.toDate) retQ = retQ.lte('created_at', range.toDate);
  const { data: returnsRaw } = await retQ;
  const totalRefunds = ((returnsRaw ?? []) as Array<{ total: number }>).reduce((s, r) => s + r.total, 0);

  return {
    summary: {
      totalSales,
      totalTransactions: sales.length,
      avgTicket: sales.length > 0 ? totalSales / sales.length : 0,
      totalDiscount,
      totalTax,
      totalRefunds,
      netSales: totalSales - totalRefunds,
    },
    byDay,
    byPaymentMethod,
    byCashier,
    topProducts,
  };
}

// ─── Inventory report ─────────────────────────────────────────────

export interface InventoryReport {
  summary: {
    totalProducts: number;
    totalUnits: number;
    totalValueCost: number;
    totalValueSale: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  byCategory: Array<{ categoryName: string; productCount: number; stockValue: number }>;
  lowStock: Array<{ productName: string; sku: string; branchName: string; available: number; minQuantity: number }>;
  recentMovements: Array<{ type: string; quantity: number; productName: string; branchName: string; createdAt: string }>;
}

export async function getInventoryReport(
  supabase: LooseSupabaseClient,
  branchId?: string | null,
): Promise<InventoryReport> {
  let q = supabase.from('v_inventory_stock_levels').select('*');
  if (branchId) q = q.eq('branch_id', branchId);
  const { data: stockRaw, error } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const stock = (stockRaw ?? []) as Array<{
    product_name: string; product_sku: string; product_type: string;
    category_name: string | null; quantity: number; available_quantity: number;
    min_quantity: number; stock_value_cost: number; stock_value_sale: number;
    is_low_stock: boolean; branch_id: string;
  }>;

  const totalProducts = stock.length;
  const totalUnits = stock.reduce((s, x) => s + x.quantity, 0);
  const totalValueCost = stock.reduce((s, x) => s + (x.stock_value_cost ?? 0), 0);
  const totalValueSale = stock.reduce((s, x) => s + (x.stock_value_sale ?? 0), 0);
  const lowStockCount = stock.filter((x) => x.is_low_stock && x.available_quantity > 0).length;
  const outOfStockCount = stock.filter((x) => x.available_quantity <= 0).length;

  // By category
  const catMap = new Map<string, { productCount: number; stockValue: number }>();
  stock.forEach((s) => {
    const cat = s.category_name ?? 'بدون فئة';
    const existing = catMap.get(cat) ?? { productCount: 0, stockValue: 0 };
    existing.productCount += 1;
    existing.stockValue += s.stock_value_cost ?? 0;
    catMap.set(cat, existing);
  });
  const byCategory = Array.from(catMap.entries()).map(([categoryName, v]) => ({ categoryName, ...v }));

  // Low stock list
  let movQ = supabase
    .from('v_stock_movements_with_names')
    .select('type, quantity, product_name, branch_name, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (branchId) movQ = movQ.eq('branch_id', branchId);
  const { data: movRaw } = await movQ;
  const recentMovements = ((movRaw ?? []) as Array<{
    type: string; quantity: number; product_name: string; branch_name: string; created_at: string;
  }>).map((m) => ({
    type: m.type,
    quantity: m.quantity,
    productName: m.product_name ?? '—',
    branchName: m.branch_name ?? '—',
    createdAt: m.created_at,
  }));

  // Load branch names for low stock
  const branchIds = [...new Set(stock.map((s) => s.branch_id))];
  let branchNames = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches } = await supabase.from('branches').select('id, name').in('id', branchIds);
    (branches ?? []).forEach((b: { id: string; name: string }) => branchNames.set(b.id, b.name));
  }
  const lowStock = stock
    .filter((x) => x.is_low_stock)
    .slice(0, 20)
    .map((x) => ({
      productName: x.product_name,
      sku: x.product_sku,
      branchName: branchNames.get(x.branch_id) ?? '—',
      available: x.available_quantity,
      minQuantity: x.min_quantity,
    }));

  return {
    summary: { totalProducts, totalUnits, totalValueCost, totalValueSale, lowStockCount, outOfStockCount },
    byCategory,
    lowStock,
    recentMovements,
  };
}

// ─── Repairs report ───────────────────────────────────────────────

export interface RepairsReport {
  summary: {
    totalRepairs: number;
    completed: number;
    active: number;
    canceled: number;
    totalRevenue: number;
    avgRepairTime: number; // in hours
  };
  byStatus: Array<{ status: string; count: number }>;
  byTechnician: Array<{ technicianName: string; count: number; revenue: number }>;
  byDay: Array<{ date: string; received: number; delivered: number }>;
}

export async function getRepairsReport(
  supabase: LooseSupabaseClient,
  branchId?: string | null,
  range?: DateRange,
): Promise<RepairsReport> {
  let q = supabase
    .from('repairs')
    .select('id, status, total, technician_id, received_at, delivered_at, created_at')
    .is('deleted_at', null);
  if (branchId) q = q.eq('branch_id', branchId);
  if (range?.fromDate) q = q.gte('created_at', range.fromDate);
  if (range?.toDate) q = q.lte('created_at', range.toDate);
  const { data: repairsRaw, error } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const repairs = (repairsRaw ?? []) as Array<{
    id: string; status: string; total: number; technician_id: string | null;
    received_at: string; delivered_at: string | null; created_at: string;
  }>;

  const completed = repairs.filter((r) => r.status === 'delivered');
  const active = repairs.filter((r) => !['delivered', 'canceled'].includes(r.status));
  const canceled = repairs.filter((r) => r.status === 'canceled');
  const totalRevenue = completed.reduce((s, r) => s + r.total, 0);

  // Avg repair time (hours)
  let totalRepairTime = 0;
  let repairTimeCount = 0;
  completed.forEach((r) => {
    if (r.delivered_at && r.received_at) {
      const diff = new Date(r.delivered_at).getTime() - new Date(r.received_at).getTime();
      totalRepairTime += diff / (1000 * 60 * 60); // hours
      repairTimeCount += 1;
    }
  });
  const avgRepairTime = repairTimeCount > 0 ? totalRepairTime / repairTimeCount : 0;

  // By status
  const statusMap = new Map<string, number>();
  repairs.forEach((r) => statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1));
  const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // By technician
  const techIds = [...new Set(repairs.filter((r) => r.technician_id).map((r) => r.technician_id!))];
  let techNames = new Map<string, string>();
  if (techIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', techIds);
    (users ?? []).forEach((u: { id: string; full_name: string }) => techNames.set(u.id, u.full_name));
  }
  const techMap = new Map<string, { count: number; revenue: number }>();
  repairs.forEach((r) => {
    if (!r.technician_id) return;
    const existing = techMap.get(r.technician_id) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    if (r.status === 'delivered') existing.revenue += r.total;
    techMap.set(r.technician_id, existing);
  });
  const byTechnician = Array.from(techMap.entries()).map(([id, v]) => ({
    technicianName: techNames.get(id) ?? '—',
    ...v,
  }));

  // By day
  const dayMap = new Map<string, { received: number; delivered: number }>();
  repairs.forEach((r) => {
    const day = r.created_at.split('T')[0]!;
    const existing = dayMap.get(day) ?? { received: 0, delivered: 0 };
    existing.received += 1;
    if (r.status === 'delivered' && r.delivered_at && r.delivered_at.split('T')[0] === day) {
      existing.delivered += 1;
    }
    dayMap.set(day, existing);
  });
  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: {
      totalRepairs: repairs.length,
      completed: completed.length,
      active: active.length,
      canceled: canceled.length,
      totalRevenue,
      avgRepairTime,
    },
    byStatus,
    byTechnician,
    byDay,
  };
}

// ─── Finance report ───────────────────────────────────────────────

export interface FinanceReport {
  summary: {
    totalRevenues: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
  expensesByCategory: Array<{ categoryName: string; total: number; count: number }>;
  revenuesByCategory: Array<{ categoryName: string; total: number; count: number }>;
  dailyPnL: Array<{ date: string; revenues: number; expenses: number; net: number }>;
}

export async function getFinanceReport(
  supabase: LooseSupabaseClient,
  branchId?: string | null,
  range?: DateRange,
): Promise<FinanceReport> {
  // Expenses
  let expQ = supabase
    .from('v_expenses_list')
    .select('amount, date, category_name')
    .is('deleted_at', null);
  if (branchId) expQ = expQ.eq('branch_id', branchId);
  if (range?.fromDate) expQ = expQ.gte('date', range.fromDate.split('T')[0]);
  if (range?.toDate) expQ = expQ.lte('date', range.toDate.split('T')[0]);
  const { data: expRaw } = await expQ;
  const expenses = (expRaw ?? []) as Array<{ amount: number; date: string; category_name: string | null }>;

  // Revenues
  let revQ = supabase
    .from('v_revenues_list')
    .select('amount, date, category_name')
    .is('deleted_at', null);
  if (branchId) revQ = revQ.eq('branch_id', branchId);
  if (range?.fromDate) revQ = revQ.gte('date', range.fromDate.split('T')[0]);
  if (range?.toDate) revQ = revQ.lte('date', range.toDate.split('T')[0]);
  const { data: revRaw } = await revQ;
  const revenues = (revRaw ?? []) as Array<{ amount: number; date: string; category_name: string | null }>;

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenues = revenues.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalRevenues - totalExpenses;
  const profitMargin = totalRevenues > 0 ? (netProfit / totalRevenues) * 100 : 0;

  // Expenses by category
  const expCatMap = new Map<string, { total: number; count: number }>();
  expenses.forEach((e) => {
    const cat = e.category_name ?? 'أخرى';
    const existing = expCatMap.get(cat) ?? { total: 0, count: 0 };
    existing.total += e.amount;
    existing.count += 1;
    expCatMap.set(cat, existing);
  });
  const expensesByCategory = Array.from(expCatMap.entries()).map(([categoryName, v]) => ({ categoryName, ...v }));

  // Revenues by category
  const revCatMap = new Map<string, { total: number; count: number }>();
  revenues.forEach((r) => {
    const cat = r.category_name ?? 'أخرى';
    const existing = revCatMap.get(cat) ?? { total: 0, count: 0 };
    existing.total += r.amount;
    existing.count += 1;
    revCatMap.set(cat, existing);
  });
  const revenuesByCategory = Array.from(revCatMap.entries()).map(([categoryName, v]) => ({ categoryName, ...v }));

  // Daily P&L
  const dayMap = new Map<string, { revenues: number; expenses: number }>();
  revenues.forEach((r) => {
    const existing = dayMap.get(r.date) ?? { revenues: 0, expenses: 0 };
    existing.revenues += r.amount;
    dayMap.set(r.date, existing);
  });
  expenses.forEach((e) => {
    const existing = dayMap.get(e.date) ?? { revenues: 0, expenses: 0 };
    existing.expenses += e.amount;
    dayMap.set(e.date, existing);
  });
  const dailyPnL = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v, net: v.revenues - v.expenses }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: { totalRevenues, totalExpenses, netProfit, profitMargin },
    expensesByCategory,
    revenuesByCategory,
    dailyPnL,
  };
}
