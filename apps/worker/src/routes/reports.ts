import { Hono } from 'hono';
import { ApiResponse } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  getDashboardOverview,
  getSalesReport,
  getInventoryReport,
  getRepairsReport,
  getFinanceReport,
} from '../services/report.service';

export const reportRoutes = new Hono<AppContext>();

reportRoutes.use('*', authMiddleware);

// ─── GET /reports/dashboard ───────────────────────────────────────
reportRoutes.get('/dashboard', requirePermission('dashboard.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  const branchId = actor.roleKey === 'super_admin' || actor.roleKey === 'admin'
    ? (c.req.query('branchId') ?? undefined)
    : actor.branchId;
  const overview = await getDashboardOverview(supabase, branchId);
  const response: ApiResponse<typeof overview> = { success: true, data: overview };
  return c.json(response, 200);
});

// ─── GET /reports/sales ───────────────────────────────────────────
reportRoutes.get('/sales', requirePermission('reports.sales'), async (c) => {
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  const branchId = actor.roleKey === 'super_admin' || actor.roleKey === 'admin'
    ? (c.req.query('branchId') ?? undefined)
    : actor.branchId;
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const report = await getSalesReport(supabase, branchId, { fromDate, toDate });
  const response: ApiResponse<typeof report> = { success: true, data: report };
  return c.json(response, 200);
});

// ─── GET /reports/inventory ───────────────────────────────────────
reportRoutes.get('/inventory', requirePermission('reports.inventory'), async (c) => {
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  const branchId = actor.roleKey === 'super_admin' || actor.roleKey === 'admin'
    ? (c.req.query('branchId') ?? undefined)
    : actor.branchId;
  const report = await getInventoryReport(supabase, branchId);
  const response: ApiResponse<typeof report> = { success: true, data: report };
  return c.json(response, 200);
});

// ─── GET /reports/repairs ─────────────────────────────────────────
reportRoutes.get('/repairs', requirePermission('reports.repairs'), async (c) => {
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  const branchId = actor.roleKey === 'super_admin' || actor.roleKey === 'admin'
    ? (c.req.query('branchId') ?? undefined)
    : actor.branchId;
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const report = await getRepairsReport(supabase, branchId, { fromDate, toDate });
  const response: ApiResponse<typeof report> = { success: true, data: report };
  return c.json(response, 200);
});

// ─── GET /reports/finance ─────────────────────────────────────────
reportRoutes.get('/finance', requirePermission('reports.finance'), async (c) => {
  const supabase = getReqSupabase(c);
  const actor = requireUser(c);
  const branchId = actor.roleKey === 'super_admin' || actor.roleKey === 'admin'
    ? (c.req.query('branchId') ?? undefined)
    : actor.branchId;
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const report = await getFinanceReport(supabase, branchId, { fromDate, toDate });
  const response: ApiResponse<typeof report> = { success: true, data: report };
  return c.json(response, 200);
});
