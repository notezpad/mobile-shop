import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse,
  type Customer,
  type PaginatedResult,
  type CustomerTransaction,
  type CustomerPayment,
  createCustomerSchema,
  updateCustomerSchema,
  adjustCustomerBalanceSchema,
  recordCustomerPaymentSchema,
  customerQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  adjustBalance,
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerStats,
  getTransactionHistory,
  listCustomers,
  recordCustomerPayment,
  updateCustomer,
} from '../services/customer.service';

export const customerRoutes = new Hono<AppContext>();

customerRoutes.use('*', authMiddleware);

// ─── GET /customers ────────────────────────────────────────────────
customerRoutes.get(
  '/',
  requirePermission('customers.view'),
  zValidator('query', customerQuerySchema),
  async (c) => {
    const query = c.req.valid('query');
    const supabase = getReqSupabase(c);
    const result = await listCustomers(supabase, query);

    const response: ApiResponse<PaginatedResult<Customer>> = {
      success: true,
      data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

// ─── GET /customers/:id ────────────────────────────────────────────
customerRoutes.get('/:id', requirePermission('customers.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const customer = await getCustomer(supabase, id);

  const response: ApiResponse<Customer> = { success: true, data: customer };
  return c.json(response, 200);
});

// ─── GET /customers/:id/transactions ───────────────────────────────
customerRoutes.get('/:id/transactions', requirePermission('customers.view'), async (c) => {
  const id = c.req.param('id');
  const page = Number(c.req.query('page') ?? '1');
  const pageSize = Number(c.req.query('pageSize') ?? '20');
  const supabase = getReqSupabase(c);
  const result = await getTransactionHistory(supabase, id, { page, pageSize });

  const response: ApiResponse<PaginatedResult<CustomerTransaction>> = {
    success: true,
    data: result,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total },
  };
  return c.json(response, 200);
});

// ─── GET /customers/:id/stats ──────────────────────────────────────
customerRoutes.get('/:id/stats', requirePermission('customers.view'), async (c) => {
  const id = c.req.param('id');
  const supabase = getReqSupabase(c);
  const stats = await getCustomerStats(supabase, id);

  const response: ApiResponse<typeof stats> = { success: true, data: stats };
  return c.json(response, 200);
});

// ─── POST /customers ───────────────────────────────────────────────
customerRoutes.post(
  '/',
  requirePermission('customers.create'),
  zValidator('json', createCustomerSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const customer = await createCustomer(supabase, input, actor);

    const response: ApiResponse<Customer> = { success: true, data: customer };
    return c.json(response, 201);
  },
);

// ─── PATCH /customers/:id ──────────────────────────────────────────
customerRoutes.patch(
  '/:id',
  requirePermission('customers.edit'),
  zValidator('json', updateCustomerSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const customer = await updateCustomer(supabase, id, input, actor);

    const response: ApiResponse<Customer> = { success: true, data: customer };
    return c.json(response, 200);
  },
);

// ─── POST /customers/:id/adjust-balance ────────────────────────────
customerRoutes.post(
  '/:id/adjust-balance',
  requirePermission('customers.edit'),
  zValidator('json', adjustCustomerBalanceSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const customer = await adjustBalance(supabase, id, input, actor);

    const response: ApiResponse<Customer> = { success: true, data: customer };
    return c.json(response, 200);
  },
);

// ─── POST /customers/:id/payments ──────────────────────────────────
// Record a customer payment (installment / settlement on running balance).
// Reduces customer.balance + adds to cashbox if cash-based method.
customerRoutes.post(
  '/:id/payments',
  requirePermission('customers.edit'),
  zValidator('json', recordCustomerPaymentSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const result = await recordCustomerPayment(supabase, id, input, actor);

    const response: ApiResponse<{ payment: CustomerPayment; customer: Customer }> = {
      success: true,
      data: result,
    };
    return c.json(response, 201);
  },
);

// ─── DELETE /customers/:id ─────────────────────────────────────────
customerRoutes.delete('/:id', requirePermission('customers.delete'), async (c) => {
  const id = c.req.param('id');
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteCustomer(supabase, id, actor);

  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});
