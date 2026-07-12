import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Cashbox,
  type PaginatedResult,
  type Expense,
  type Revenue,
  type ExpenseCategory,
  type RevenueCategory,
  type PaymentMethod,
  type CashboxTransaction,
  openCashboxSchema,
  closeCashboxSchema,
  cashboxQuerySchema,
  createExpenseSchema,
  updateExpenseSchema,
  expenseQuerySchema,
  createExpenseCategorySchema,
  createRevenueSchema,
  updateRevenueSchema,
  revenueQuerySchema,
  createRevenueCategorySchema,
  updatePaymentMethodSchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  closeCashbox,
  createExpense,
  createExpenseCategory,
  createRevenue,
  createRevenueCategory,
  deleteExpense,
  deleteRevenue,
  getCurrentCashbox,
  getCashboxTransactions,
  listCashboxes,
  listExpenseCategories,
  listExpenses,
  listPaymentMethods,
  listRevenues,
  listRevenueCategories,
  openCashbox,
  updateExpense,
  updatePaymentMethod,
  updateRevenue,
  getFinanceSummary,
} from '../services/finance.service';

// ─── Cashbox routes ───────────────────────────────────────────────

export const cashboxRoutes = new Hono<AppContext>();
cashboxRoutes.use('*', authMiddleware);

cashboxRoutes.get('/current', requirePermission('cashbox.view'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  const cashbox = await getCurrentCashbox(supabase, actor.id);
  const response: ApiResponse<Cashbox | null> = { success: true, data: cashbox };
  return c.json(response, 200);
});

cashboxRoutes.get(
  '/',
  requirePermission('cashbox.view'),
  zValidator('query', cashboxQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listCashboxes(supabase, query);
    const response: ApiResponse<PaginatedResult<Cashbox>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

cashboxRoutes.get('/:id/transactions', requirePermission('cashbox.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const txns = await getCashboxTransactions(supabase, id);
  const response: ApiResponse<CashboxTransaction[]> = { success: true, data: txns };
  return c.json(response, 200);
});

cashboxRoutes.post(
  '/open',
  requirePermission('cashbox.open'),
  zValidator('json', openCashboxSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const cashbox = await openCashbox(supabase, input, actor);
    const response: ApiResponse<Cashbox> = { success: true, data: cashbox };
    return c.json(response, 201);
  },
);

cashboxRoutes.post(
  '/:id/close',
  requirePermission('cashbox.close'),
  zValidator('json', closeCashboxSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const cashbox = await closeCashbox(supabase, id, input, actor);
    const response: ApiResponse<Cashbox> = { success: true, data: cashbox };
    return c.json(response, 200);
  },
);

// ─── Expense routes ───────────────────────────────────────────────

export const expenseRoutes = new Hono<AppContext>();
expenseRoutes.use('*', authMiddleware);

expenseRoutes.get('/categories', requirePermission('expenses.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const cats = await listExpenseCategories(supabase);
  const response: ApiResponse<ExpenseCategory[]> = { success: true, data: cats };
  return c.json(response, 200);
});

expenseRoutes.post(
  '/categories',
  requirePermission('expenses.create'),
  zValidator('json', createExpenseCategorySchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const cat = await createExpenseCategory(supabase, input, actor);
    const response: ApiResponse<ExpenseCategory> = { success: true, data: cat };
    return c.json(response, 201);
  },
);

expenseRoutes.get(
  '/',
  requirePermission('expenses.view'),
  zValidator('query', expenseQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listExpenses(supabase, query);
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

expenseRoutes.post(
  '/',
  requirePermission('expenses.create'),
  zValidator('json', createExpenseSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const expense = await createExpense(supabase, input, actor);
    const response: ApiResponse<Expense> = { success: true, data: expense };
    return c.json(response, 201);
  },
);

expenseRoutes.patch(
  '/:id',
  requirePermission('expenses.edit'),
  zValidator('json', updateExpenseSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const expense = await updateExpense(supabase, id, input, actor);
    const response: ApiResponse<Expense> = { success: true, data: expense };
    return c.json(response, 200);
  },
);

expenseRoutes.delete('/:id', requirePermission('expenses.delete'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteExpense(supabase, id, actor);
  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});

// ─── Revenue routes ───────────────────────────────────────────────

export const revenueRoutes = new Hono<AppContext>();
revenueRoutes.use('*', authMiddleware);

revenueRoutes.get('/categories', requirePermission('revenues.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const cats = await listRevenueCategories(supabase);
  const response: ApiResponse<RevenueCategory[]> = { success: true, data: cats };
  return c.json(response, 200);
});

revenueRoutes.post(
  '/categories',
  requirePermission('revenues.create'),
  zValidator('json', createRevenueCategorySchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const cat = await createRevenueCategory(supabase, input, actor);
    const response: ApiResponse<RevenueCategory> = { success: true, data: cat };
    return c.json(response, 201);
  },
);

revenueRoutes.get(
  '/',
  requirePermission('revenues.view'),
  zValidator('query', revenueQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listRevenues(supabase, query);
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

revenueRoutes.post(
  '/',
  requirePermission('revenues.create'),
  zValidator('json', createRevenueSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const revenue = await createRevenue(supabase, input, actor);
    const response: ApiResponse<Revenue> = { success: true, data: revenue };
    return c.json(response, 201);
  },
);

revenueRoutes.patch(
  '/:id',
  requirePermission('revenues.edit'),
  zValidator('json', updateRevenueSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const revenue = await updateRevenue(supabase, id, input, actor);
    const response: ApiResponse<Revenue> = { success: true, data: revenue };
    return c.json(response, 200);
  },
);

revenueRoutes.delete('/:id', requirePermission('revenues.delete'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteRevenue(supabase, id, actor);
  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});

// ─── Payment method routes ────────────────────────────────────────

export const paymentMethodRoutes = new Hono<AppContext>();
paymentMethodRoutes.use('*', authMiddleware);

paymentMethodRoutes.get('/', requirePermission('payments.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const methods = await listPaymentMethods(supabase);
  const response: ApiResponse<PaymentMethod[]> = { success: true, data: methods };
  return c.json(response, 200);
});

paymentMethodRoutes.patch(
  '/:id',
  requirePermission('payments.manage'),
  zValidator('json', updatePaymentMethodSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const supabase = getReqSupabase(c);
    const method = await updatePaymentMethod(supabase, id, input);
    const response: ApiResponse<PaymentMethod> = { success: true, data: method };
    return c.json(response, 200);
  },
);

// ─── Finance summary ──────────────────────────────────────────────

export const financeSummaryRoutes = new Hono<AppContext>();
financeSummaryRoutes.use('*', authMiddleware);

financeSummaryRoutes.get('/summary', requirePermission('expenses.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const branchId = c.req.query('branchId') ?? undefined;
  const fromDate = c.req.query('fromDate') ?? undefined;
  const toDate = c.req.query('toDate') ?? undefined;
  const summary = await getFinanceSummary(supabase, branchId, fromDate, toDate);
  const response: ApiResponse<typeof summary> = { success: true, data: summary };
  return c.json(response, 200);
});
