import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { AppProviders } from './providers/AppProviders';
import { AuthLayout } from './layouts/AuthLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { AppSkeleton } from '@components/layout/AppSkeleton';
import { ProtectedRoute } from '@components/feedback/ProtectedRoute';

// Lazy-loaded pages — code-split per route.
const LoginPage = lazy(() => import('@modules/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('@modules/dashboard/pages/DashboardPage'));
const NotFoundPage = lazy(() => import('@core/components/NotFoundPage'));
const UnauthorizedPage = lazy(() => import('@core/components/UnauthorizedPage'));

// Users module
const UsersListPage = lazy(() => import('@modules/users/pages/UsersListPage'));
const UserFormPage = lazy(() => import('@modules/users/pages/UserFormPage'));
const UserPasswordPage = lazy(() => import('@modules/users/pages/UserPasswordPage'));

// Roles module
const RolesListPage = lazy(() => import('@modules/roles/pages/RolesListPage'));
const RoleEditPage = lazy(() => import('@modules/roles/pages/RoleEditPage'));

// Branches module
const BranchesListPage = lazy(() => import('@modules/branches/pages/BranchesListPage'));
const BranchFormPage = lazy(() => import('@modules/branches/pages/BranchFormPage'));

// Catalog module
const CategoriesPage = lazy(() => import('@modules/catalog/pages/CategoriesPage'));
const ProductsListPage = lazy(() => import('@modules/catalog/pages/ProductsListPage'));
const ProductFormPage = lazy(() => import('@modules/catalog/pages/ProductFormPage'));
const ProductDetailPage = lazy(() => import('@modules/catalog/pages/ProductDetailPage'));
const DevicesListPage = lazy(() => import('@modules/catalog/pages/DevicesListPage'));

// Inventory module
const InventoryListPage = lazy(() => import('@modules/inventory/pages/InventoryListPage'));
const StockMovementsPage = lazy(() => import('@modules/inventory/pages/StockMovementsPage'));
const StocktakePage = lazy(() => import('@modules/inventory/pages/StocktakePage'));
const StockTransfersListPage = lazy(() => import('@modules/inventory/pages/StockTransfersListPage'));
const StockTransferFormPage = lazy(() => import('@modules/inventory/pages/StockTransferFormPage'));
const StockTransferDetailPage = lazy(() => import('@modules/inventory/pages/StockTransferDetailPage'));

// Customers module
const CustomersListPage = lazy(() => import('@modules/customers/pages/CustomersListPage'));
const CustomerFormPage = lazy(() => import('@modules/customers/pages/CustomerFormPage'));
const CustomerDetailPage = lazy(() => import('@modules/customers/pages/CustomerDetailPage'));

// Suppliers module
const SuppliersListPage = lazy(() => import('@modules/suppliers/pages/SuppliersListPage'));
const SupplierFormPage = lazy(() => import('@modules/suppliers/pages/SupplierFormPage'));

// Sales module
const POSPage = lazy(() => import('@modules/sales/pages/POSPage'));
const SalesListPage = lazy(() => import('@modules/sales/pages/SalesListPage'));
const SaleDetailPage = lazy(() => import('@modules/sales/pages/SaleDetailPage'));

// Returns module
const ReturnsListPage = lazy(() => import('@modules/returns/pages/ReturnsListPage'));
const ReturnFormPage = lazy(() => import('@modules/returns/pages/ReturnFormPage'));
const ReturnDetailPage = lazy(() => import('@modules/returns/pages/ReturnDetailPage'));

// Repairs module
const RepairsListPage = lazy(() => import('@modules/repairs/pages/RepairsListPage'));
const RepairFormPage = lazy(() => import('@modules/repairs/pages/RepairFormPage'));
const RepairDetailPage = lazy(() => import('@modules/repairs/pages/RepairDetailPage'));
const RepairTrackPage = lazy(() => import('@modules/repairs/pages/RepairTrackPage'));

// Finance module
const CashboxPage = lazy(() => import('@modules/finance/pages/CashboxPage'));
const ExpensesPage = lazy(() => import('@modules/finance/pages/ExpensesPage'));
const RevenuesPage = lazy(() => import('@modules/finance/pages/RevenuesPage'));

// Reports module
const SalesReportPage = lazy(() => import('@modules/reports/pages/SalesReportPage'));
const InventoryReportPage = lazy(() => import('@modules/reports/pages/InventoryReportPage'));
const RepairsReportPage = lazy(() => import('@modules/reports/pages/RepairsReportPage'));
const FinanceReportPage = lazy(() => import('@modules/reports/pages/FinanceReportPage'));

// Employees module
const EmployeesListPage = lazy(() => import('@modules/employees/pages/EmployeesListPage'));
const EmployeeFormPage = lazy(() => import('@modules/employees/pages/EmployeeFormPage'));
const EmployeeDetailPage = lazy(() => import('@modules/employees/pages/EmployeeDetailPage'));

// Backup module
const BackupPage = lazy(() => import('@modules/backup/pages/BackupPage'));

// Audit module
const AuditLogsPage = lazy(() => import('@modules/audit/pages/AuditLogsPage'));

// Tenant module (SaaS)
const TenantSignupPage = lazy(() => import('@modules/tenant/pages/TenantSignupPage'));

// Settings module
const SettingsPage = lazy(() => import('@modules/settings/pages/SettingsPage'));

const routes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <Suspense fallback={<AppSkeleton />}>
        <AuthLayout />
      </Suspense>
    ),
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    path: '/signup',
    element: (
      <Suspense fallback={<AppSkeleton />}>
        <TenantSignupPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <Suspense fallback={<AppSkeleton />}>
        <DashboardLayout />
      </Suspense>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute permission="dashboard.view">
            <DashboardPage />
          </ProtectedRoute>
        ),
      },

      // ─── Users ────────────────────────────────────────────────
      {
        path: 'users',
        element: (
          <ProtectedRoute permission="users.view">
            <UsersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users/new',
        element: (
          <ProtectedRoute permission="users.create">
            <UserFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users/:id/edit',
        element: (
          <ProtectedRoute permission="users.edit">
            <UserFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users/:id/password',
        element: (
          <ProtectedRoute permission="users.edit">
            <UserPasswordPage />
          </ProtectedRoute>
        ),
      },

      // ─── Roles & Permissions ──────────────────────────────────
      {
        path: 'roles',
        element: (
          <ProtectedRoute permission="roles.view">
            <RolesListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'roles/new',
        element: (
          <ProtectedRoute permission="roles.manage">
            <RoleEditPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'roles/:id/edit',
        element: (
          <ProtectedRoute permission="roles.manage">
            <RoleEditPage />
          </ProtectedRoute>
        ),
      },

      // ─── Branches ─────────────────────────────────────────────
      {
        path: 'branches',
        element: (
          <ProtectedRoute permission="branches.view">
            <BranchesListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'branches/new',
        element: (
          <ProtectedRoute permission="branches.manage">
            <BranchFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'branches/:id/edit',
        element: (
          <ProtectedRoute permission="branches.manage">
            <BranchFormPage />
          </ProtectedRoute>
        ),
      },

      // ─── Settings ─────────────────────────────────────────────
      {
        path: 'settings',
        element: (
          <ProtectedRoute permission="settings.view">
            <SettingsPage />
          </ProtectedRoute>
        ),
      },

      // ─── Catalog: Categories ──────────────────────────────────
      {
        path: 'catalog/categories',
        element: (
          <ProtectedRoute permission="catalog.products.view">
            <CategoriesPage />
          </ProtectedRoute>
        ),
      },

      // ─── Catalog: Products ────────────────────────────────────
      {
        path: 'catalog/products',
        element: (
          <ProtectedRoute permission="catalog.products.view">
            <ProductsListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/products/new',
        element: (
          <ProtectedRoute permission="catalog.products.create">
            <ProductFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/products/:id',
        element: (
          <ProtectedRoute permission="catalog.products.view">
            <ProductDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'catalog/products/:id/edit',
        element: (
          <ProtectedRoute permission="catalog.products.edit">
            <ProductFormPage />
          </ProtectedRoute>
        ),
      },

      // ─── Catalog: Devices (IMEI) ──────────────────────────────
      {
        path: 'catalog/devices',
        element: (
          <ProtectedRoute permission="catalog.devices.view">
            <DevicesListPage />
          </ProtectedRoute>
        ),
      },

      // ─── Inventory ────────────────────────────────────────────
      {
        path: 'inventory',
        element: (
          <ProtectedRoute permission="inventory.view">
            <InventoryListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/movements',
        element: (
          <ProtectedRoute permission="inventory.view">
            <StockMovementsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/stocktake',
        element: (
          <ProtectedRoute permission="inventory.stocktake">
            <StocktakePage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/transfers',
        element: (
          <ProtectedRoute permission="inventory.transfer">
            <StockTransfersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/transfers/new',
        element: (
          <ProtectedRoute permission="inventory.transfer">
            <StockTransferFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'inventory/transfers/:id',
        element: (
          <ProtectedRoute permission="inventory.transfer">
            <StockTransferDetailPage />
          </ProtectedRoute>
        ),
      },

      // ─── Customers ────────────────────────────────────────────
      {
        path: 'customers',
        element: (
          <ProtectedRoute permission="customers.view">
            <CustomersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'customers/new',
        element: (
          <ProtectedRoute permission="customers.create">
            <CustomerFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'customers/:id',
        element: (
          <ProtectedRoute permission="customers.view">
            <CustomerDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'customers/:id/edit',
        element: (
          <ProtectedRoute permission="customers.edit">
            <CustomerFormPage />
          </ProtectedRoute>
        ),
      },

      // ─── Suppliers ────────────────────────────────────────────
      {
        path: 'suppliers',
        element: (
          <ProtectedRoute permission="catalog.suppliers.manage">
            <SuppliersListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers/new',
        element: (
          <ProtectedRoute permission="catalog.suppliers.manage">
            <SupplierFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'suppliers/:id/edit',
        element: (
          <ProtectedRoute permission="catalog.suppliers.manage">
            <SupplierFormPage />
          </ProtectedRoute>
        ),
      },

      // ─── Sales (POS) ──────────────────────────────────────────
      {
        path: 'pos',
        element: (
          <ProtectedRoute permission="sales.create">
            <POSPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'sales',
        element: (
          <ProtectedRoute permission="sales.view">
            <SalesListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'sales/:id',
        element: (
          <ProtectedRoute permission="sales.view">
            <SaleDetailPage />
          </ProtectedRoute>
        ),
      },

      // ─── Returns ──────────────────────────────────────────────
      {
        path: 'returns',
        element: (
          <ProtectedRoute permission="returns.view">
            <ReturnsListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'returns/new',
        element: (
          <ProtectedRoute permission="returns.create">
            <ReturnFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'returns/:id',
        element: (
          <ProtectedRoute permission="returns.view">
            <ReturnDetailPage />
          </ProtectedRoute>
        ),
      },

      // ─── Repairs ──────────────────────────────────────────────
      {
        path: 'repairs',
        element: (
          <ProtectedRoute permission="repairs.view">
            <RepairsListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'repairs/new',
        element: (
          <ProtectedRoute permission="repairs.create">
            <RepairFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'repairs/:id',
        element: (
          <ProtectedRoute permission="repairs.view">
            <RepairDetailPage />
          </ProtectedRoute>
        ),
      },

      // ─── Finance ──────────────────────────────────────────────
      {
        path: 'cashbox',
        element: (
          <ProtectedRoute permission="cashbox.view">
            <CashboxPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'expenses',
        element: (
          <ProtectedRoute permission="expenses.view">
            <ExpensesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'revenues',
        element: (
          <ProtectedRoute permission="revenues.view">
            <RevenuesPage />
          </ProtectedRoute>
        ),
      },

      // ─── Reports ──────────────────────────────────────────────
      {
        path: 'reports/sales',
        element: (
          <ProtectedRoute permission="reports.sales">
            <SalesReportPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports/inventory',
        element: (
          <ProtectedRoute permission="reports.inventory">
            <InventoryReportPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports/repairs',
        element: (
          <ProtectedRoute permission="reports.repairs">
            <RepairsReportPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reports/finance',
        element: (
          <ProtectedRoute permission="reports.finance">
            <FinanceReportPage />
          </ProtectedRoute>
        ),
      },

      // ─── Employees ────────────────────────────────────────────
      {
        path: 'employees',
        element: (
          <ProtectedRoute permission="employees.view">
            <EmployeesListPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employees/new',
        element: (
          <ProtectedRoute permission="employees.create">
            <EmployeeFormPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employees/:id',
        element: (
          <ProtectedRoute permission="employees.view">
            <EmployeeDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employees/:id/edit',
        element: (
          <ProtectedRoute permission="employees.edit">
            <EmployeeFormPage />
          </ProtectedRoute>
        ),
      },

      // ─── Backup ───────────────────────────────────────────────
      {
        path: 'backup',
        element: (
          <ProtectedRoute permission="backup.view">
            <BackupPage />
          </ProtectedRoute>
        ),
      },

      // ─── Audit Logs ───────────────────────────────────────────
      {
        path: 'audit-logs',
        element: (
          <ProtectedRoute permission="audit_logs.view">
            <AuditLogsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
  // ─── Public: repair tracking (no auth) ─────────────────────
  {
    path: '/repairs/track/:ticketNo',
    element: (
      <Suspense fallback={<AppSkeleton />}>
        <RepairTrackPage />
      </Suspense>
    ),
  },
  { path: '/unauthorized', element: <UnauthorizedPage /> },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);

export function AppRouter() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
