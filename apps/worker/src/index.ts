import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';

import { API_PREFIX } from '@mobile-shop/shared';
import type { AppContext } from './types/env';
import { healthRoute } from './routes/health';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { roleRoutes, permissionRoutes } from './routes/roles';
import { branchRoutes } from './routes/branches';
import { settingRoutes } from './routes/settings';
import { categoryRoutes } from './routes/categories';
import { productRoutes } from './routes/products';
import { deviceRoutes } from './routes/devices';
import { inventoryRoutes } from './routes/inventory';
import { stockTransferRoutes } from './routes/stock-transfers';
import { customerRoutes } from './routes/customers';
import { supplierRoutes } from './routes/suppliers';
import { saleRoutes } from './routes/sales';
import { returnRoutes } from './routes/returns';
import { repairRoutes, repairTrackingRoutes } from './routes/repairs';
import {
  cashboxRoutes,
  expenseRoutes,
  revenueRoutes,
  paymentMethodRoutes,
  financeSummaryRoutes,
} from './routes/finance';
import { reportRoutes } from './routes/reports';
import { employeeRoutes, shiftRoutes, attendanceRoutes } from './routes/employees';
import { backupRoutes } from './routes/backups';
import { auditLogRoutes, notificationRoutes } from './routes/audit';
import { tenantRoutes } from './routes/tenants';
import { syncRoutes } from './routes/sync';
import { errorHandlerMiddleware } from './middleware/error-handler';
import { notFoundMiddleware } from './middleware/not-found';

/**
 * Hono app entrypoint for Cloudflare Workers.
 *
 * Architecture:
 *  - Each domain module mounts under `/api/v1/<module>`
 *  - Auth middleware applies JWT verification on protected routes
 *  - RBAC middleware checks permission keys per route
 *  - Error handler catches AppError → JSON response, otherwise → 500
 */
const app = new Hono<AppContext>();

// ─── Global middleware ────────────────────────────────────────────
app.use('*', honoLogger());
app.use(
  '*',
  cors({
    origin: (_c, env) => {
      const e = env as unknown as AppContext['Bindings'];
      return e.CORS_ORIGIN;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Branch-Id'],
    exposeHeaders: ['X-Request-Id', 'X-Revision'],
    credentials: true,
    maxAge: 86400,
  }),
);
app.use('*', secureHeaders());
app.use('*', requestId());

// ─── Routes ───────────────────────────────────────────────────────
app.route(`${API_PREFIX}/health`, healthRoute);
app.route(`${API_PREFIX}/auth`, authRoutes);
app.route(`${API_PREFIX}/users`, userRoutes);
app.route(`${API_PREFIX}/roles`, roleRoutes);
app.route(`${API_PREFIX}/permissions`, permissionRoutes);
app.route(`${API_PREFIX}/branches`, branchRoutes);
app.route(`${API_PREFIX}/settings`, settingRoutes);
app.route(`${API_PREFIX}/categories`, categoryRoutes);
app.route(`${API_PREFIX}/products`, productRoutes);
app.route(`${API_PREFIX}/devices`, deviceRoutes);
app.route(`${API_PREFIX}/inventory`, inventoryRoutes);
app.route(`${API_PREFIX}/stock-transfers`, stockTransferRoutes);
app.route(`${API_PREFIX}/customers`, customerRoutes);
app.route(`${API_PREFIX}/suppliers`, supplierRoutes);
app.route(`${API_PREFIX}/sales`, saleRoutes);
app.route(`${API_PREFIX}/returns`, returnRoutes);
app.route(`${API_PREFIX}/repairs`, repairRoutes);
app.route(`${API_PREFIX}/repair-tracking`, repairTrackingRoutes); // public — no auth
app.route(`${API_PREFIX}/cashboxes`, cashboxRoutes);
app.route(`${API_PREFIX}/expenses`, expenseRoutes);
app.route(`${API_PREFIX}/revenues`, revenueRoutes);
app.route(`${API_PREFIX}/payment-methods`, paymentMethodRoutes);
app.route(`${API_PREFIX}/finance`, financeSummaryRoutes);
app.route(`${API_PREFIX}/reports`, reportRoutes);
app.route(`${API_PREFIX}/employees`, employeeRoutes);
app.route(`${API_PREFIX}/shifts`, shiftRoutes);
app.route(`${API_PREFIX}/attendance`, attendanceRoutes);
app.route(`${API_PREFIX}/backups`, backupRoutes);
app.route(`${API_PREFIX}/audit-logs`, auditLogRoutes);
app.route(`${API_PREFIX}/notifications`, notificationRoutes);
app.route(`${API_PREFIX}/tenants`, tenantRoutes);
app.route(`${API_PREFIX}/sync`, syncRoutes);

// ─── 404 handler for unmatched /api/* routes ──────────────────────
app.use(`${API_PREFIX}/*`, notFoundMiddleware);

// ─── Error handler (must be last) ─────────────────────────────────
// Catches AppError, ZodError, HTTPException, and unknown errors →
// converts them to a standard ApiResponse envelope.
app.onError(errorHandlerMiddleware);

// ─── Format zValidator's default 400 responses for /api/* ────────
app.notFound((c) => {
  if (c.req.path.startsWith(API_PREFIX)) {
    return errorHandlerMiddleware(
      new Error(`Route not found: ${c.req.method} ${c.req.path}`),
      c,
    );
  }
  // Non-API routes: fall through to static asset serving below.
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
