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

/**
 * Hono app — serves BOTH the API and the static frontend (PWA).
 *
 * Architecture:
 *  - `/api/v1/*` routes → Hono API handlers
 *  - Everything else → served from static assets (React PWA)
 *  - SPA fallback: all non-API, non-file routes return index.html
 *
 * This eliminates the need for Cloudflare Pages entirely.
 * One Worker = API + Frontend + PWA.
 */
const app = new Hono<AppContext>();

// ─── Global middleware (API only) ─────────────────────────────────
app.use('/api/*', honoLogger());
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Branch-Id'],
    exposeHeaders: ['X-Request-Id', 'X-Revision'],
    credentials: true,
    maxAge: 86400,
  }),
);
app.use('/api/*', secureHeaders());
app.use('/api/*', requestId());

// ─── API Routes ───────────────────────────────────────────────────
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
app.route(`${API_PREFIX}/repair-tracking`, repairTrackingRoutes); // public
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

// ─── Error handler ────────────────────────────────────────────────
app.onError(errorHandlerMiddleware);

/**
 * Static assets + SPA fallback.
 *
 * The `ASSETS` binding is configured in wrangler.toml under [assets].
 * Cloudflare Workers automatically serves files from the assets directory.
 * The `not_found_handling = "single-page-application"` setting in
 * wrangler.toml handles the SPA fallback (returns index.html for
 * non-file routes like /dashboard, /pos, /repairs, etc.).
 *
 * We don't need to manually handle static files — Cloudflare's
 * asset serving layer handles it BEFORE the Worker code runs
 * for any URL that matches a file in the assets directory.
 *
 * Only URLs that DON'T match a file fall through to the Worker,
 * and the SPA fallback returns index.html automatically.
 */
export default app;
