import type { RoleKey } from '../types/auth';

/**
 * Permission keys follow the format: `<module>.<action>`
 * Actions: view | create | edit | delete | export | print | approve | manage
 *
 * `manage` is a wildcard — grants all actions on the module.
 */
export const PERMISSION_KEYS = [
  // Dashboard
  'dashboard.view',

  // Customers
  'customers.view',
  'customers.create',
  'customers.edit',
  'customers.delete',
  'customers.export',

  // Employees
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.delete',

  // Catalog
  'catalog.categories.manage',
  'catalog.products.view',
  'catalog.products.create',
  'catalog.products.edit',
  'catalog.products.delete',
  'catalog.devices.view',
  'catalog.devices.create',
  'catalog.devices.edit',
  'catalog.devices.delete',
  'catalog.suppliers.manage',

  // Inventory
  'inventory.view',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.stocktake',
  'inventory.export',

  // Sales (POS)
  'sales.view',
  'sales.create',
  'sales.edit',
  'sales.void',
  'sales.discount',
  'sales.discount_approve',
  'sales.export',

  // Invoices
  'invoices.view',
  'invoices.create',
  'invoices.print',
  'invoices.export',

  // Returns
  'returns.view',
  'returns.create',
  'returns.approve',
  'returns.export',

  // Repairs
  'repairs.view',
  'repairs.create',
  'repairs.edit',
  'repairs.assign',
  'repairs.deliver',
  'repairs.cancel',
  'repairs.export',

  // Finance
  'cashbox.view',
  'cashbox.open',
  'cashbox.close',
  'cashbox.manage',
  'expenses.view',
  'expenses.create',
  'expenses.edit',
  'expenses.approve',
  'expenses.delete',
  'expenses.export',
  'revenues.view',
  'revenues.create',
  'revenues.edit',
  'revenues.approve',
  'revenues.delete',
  'revenues.export',
  'payments.view',
  'payments.manage',

  // Reports
  'reports.view',
  'reports.sales',
  'reports.inventory',
  'reports.repairs',
  'reports.finance',
  'reports.employees',
  'reports.export',

  // System
  'users.view',
  'users.create',
  'users.edit',
  'users.delete',
  'roles.view',
  'roles.manage',
  'branches.view',
  'branches.manage',
  'settings.view',
  'settings.manage',
  'backup.view',
  'backup.create',
  'backup.restore',
  'audit_logs.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * Default role → permission mapping.
 * - `super_admin` is implicit (always all permissions).
 * - Custom roles are stored in DB and override these defaults.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<RoleKey, 'super_admin'>, PermissionKey[]> = {
  admin: [
    'dashboard.view',
    'customers.view',
    'customers.create',
    'customers.edit',
    'customers.delete',
    'customers.export',
    'employees.view',
    'employees.create',
    'employees.edit',
    'catalog.categories.manage',
    'catalog.products.view',
    'catalog.products.create',
    'catalog.products.edit',
    'catalog.products.delete',
    'catalog.devices.view',
    'catalog.devices.create',
    'catalog.devices.edit',
    'catalog.devices.delete',
    'catalog.suppliers.manage',
    'inventory.view',
    'inventory.adjust',
    'inventory.transfer',
    'inventory.stocktake',
    'inventory.export',
    'sales.view',
    'sales.create',
    'sales.edit',
    'sales.void',
    'sales.discount',
    'sales.export',
    'invoices.view',
    'invoices.create',
    'invoices.print',
    'invoices.export',
    'returns.view',
    'returns.create',
    'returns.approve',
    'returns.export',
    'repairs.view',
    'repairs.create',
    'repairs.edit',
    'repairs.assign',
    'repairs.deliver',
    'repairs.cancel',
    'repairs.export',
    'cashbox.view',
    'cashbox.open',
    'cashbox.close',
    'cashbox.manage',
    'expenses.view',
    'expenses.create',
    'expenses.edit',
    'expenses.approve',
    'expenses.delete',
    'expenses.export',
    'revenues.view',
    'revenues.create',
    'revenues.edit',
    'revenues.approve',
    'revenues.delete',
    'revenues.export',
    'payments.view',
    'payments.manage',
    'reports.view',
    'reports.sales',
    'reports.inventory',
    'reports.repairs',
    'reports.finance',
    'reports.employees',
    'reports.export',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'branches.view',
    'branches.manage',
    'settings.view',
    'audit_logs.view',
  ],

  manager: [
    'dashboard.view',
    'customers.view',
    'customers.create',
    'customers.edit',
    'customers.export',
    'employees.view',
    'catalog.categories.manage',
    'catalog.products.view',
    'catalog.products.create',
    'catalog.products.edit',
    'catalog.devices.view',
    'catalog.devices.create',
    'catalog.devices.edit',
    'inventory.view',
    'inventory.adjust',
    'inventory.transfer',
    'inventory.stocktake',
    'inventory.export',
    'sales.view',
    'sales.create',
    'sales.edit',
    'sales.discount',
    'sales.discount_approve',
    'sales.export',
    'invoices.view',
    'invoices.create',
    'invoices.print',
    'invoices.export',
    'returns.view',
    'returns.create',
    'returns.approve',
    'returns.export',
    'repairs.view',
    'repairs.create',
    'repairs.edit',
    'repairs.assign',
    'repairs.deliver',
    'repairs.cancel',
    'repairs.export',
    'cashbox.view',
    'cashbox.open',
    'cashbox.close',
    'expenses.view',
    'expenses.create',
    'expenses.edit',
    'expenses.approve',
    'expenses.export',
    'revenues.view',
    'revenues.create',
    'revenues.edit',
    'revenues.approve',
    'revenues.export',
    'payments.view',
    'reports.view',
    'reports.sales',
    'reports.inventory',
    'reports.repairs',
    'reports.finance',
    'reports.employees',
    'reports.export',
    'branches.view',
    'settings.view',
  ],

  cashier: [
    'dashboard.view',
    'customers.view',
    'customers.create',
    'customers.edit',
    'catalog.products.view',
    'catalog.devices.view',
    'inventory.view',
    'sales.view',
    'sales.create',
    'sales.discount',
    'invoices.view',
    'invoices.create',
    'invoices.print',
    'returns.view',
    'returns.create',
    'repairs.view',
    'repairs.create',
    'cashbox.view',
    'cashbox.open',
    'cashbox.close',
    'payments.view',
  ],

  technician: [
    'dashboard.view',
    'customers.view',
    'catalog.products.view',
    'catalog.devices.view',
    'inventory.view',
    'repairs.view',
    'repairs.create',
    'repairs.edit',
    'repairs.deliver',
  ],

  accountant: [
    'dashboard.view',
    'customers.view',
    'sales.view',
    'sales.export',
    'invoices.view',
    'invoices.export',
    'returns.view',
    'returns.export',
    'cashbox.view',
    'cashbox.manage',
    'expenses.view',
    'expenses.create',
    'expenses.edit',
    'expenses.approve',
    'expenses.delete',
    'expenses.export',
    'revenues.view',
    'revenues.create',
    'revenues.edit',
    'revenues.approve',
    'revenues.delete',
    'revenues.export',
    'payments.view',
    'payments.manage',
    'reports.view',
    'reports.sales',
    'reports.finance',
    'reports.export',
    'audit_logs.view',
  ],
};

/** Super admin always has every permission. */
export const SUPER_ADMIN_PERMISSIONS: PermissionKey[] = [...PERMISSION_KEYS];

/** Check if a permission key is valid. */
export function isValidPermission(key: string): key is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(key);
}

/** Resolve permissions for a role (super_admin returns all). */
export function resolveRolePermissions(roleKey: RoleKey): PermissionKey[] {
  if (roleKey === 'super_admin') return SUPER_ADMIN_PERMISSIONS;
  return [...(DEFAULT_ROLE_PERMISSIONS[roleKey] ?? [])];
}

/** Check if a role has a specific permission. */
export function roleHasPermission(roleKey: RoleKey, permission: PermissionKey): boolean {
  if (roleKey === 'super_admin') return true;
  return (DEFAULT_ROLE_PERMISSIONS[roleKey] ?? []).includes(permission);
}
