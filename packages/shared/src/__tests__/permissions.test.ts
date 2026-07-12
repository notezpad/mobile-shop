import { describe, it, expect } from 'vitest';
import {
  PERMISSION_KEYS,
  resolveRolePermissions,
  roleHasPermission,
  isValidPermission,
  DEFAULT_ROLE_PERMISSIONS,
} from '../index';

describe('RBAC Permissions', () => {
  describe('PERMISSION_KEYS', () => {
    it('contains dashboard.view', () => {
      expect(PERMISSION_KEYS).toContain('dashboard.view');
    });

    it('contains all CRUD for users', () => {
      expect(PERMISSION_KEYS).toContain('users.view');
      expect(PERMISSION_KEYS).toContain('users.create');
      expect(PERMISSION_KEYS).toContain('users.edit');
      expect(PERMISSION_KEYS).toContain('users.delete');
    });

    it('has > 80 permissions', () => {
      expect(PERMISSION_KEYS.length).toBeGreaterThan(80);
    });
  });

  describe('resolveRolePermissions', () => {
    it('super_admin gets all permissions', () => {
      const perms = resolveRolePermissions('super_admin');
      expect(perms.length).toBe(PERMISSION_KEYS.length);
    });

    it('cashier has limited permissions', () => {
      const perms = resolveRolePermissions('cashier');
      expect(perms).toContain('dashboard.view');
      expect(perms).toContain('sales.create');
      expect(perms).not.toContain('users.create');
      expect(perms).not.toContain('roles.manage');
    });

    it('technician has repair permissions', () => {
      const perms = resolveRolePermissions('technician');
      expect(perms).toContain('repairs.view');
      expect(perms).toContain('repairs.create');
      expect(perms).toContain('repairs.edit');
      expect(perms).not.toContain('sales.create');
    });

    it('accountant has finance permissions', () => {
      const perms = resolveRolePermissions('accountant');
      expect(perms).toContain('expenses.view');
      expect(perms).toContain('revenues.view');
      expect(perms).toContain('reports.finance');
      expect(perms).not.toContain('sales.create');
    });
  });

  describe('roleHasPermission', () => {
    it('super_admin always returns true', () => {
      expect(roleHasPermission('super_admin', 'users.delete')).toBe(true);
      expect(roleHasPermission('super_admin', 'backup.restore')).toBe(true);
    });

    it('cashier cannot delete users', () => {
      expect(roleHasPermission('cashier', 'users.delete')).toBe(false);
    });

    it('manager can approve returns', () => {
      expect(roleHasPermission('manager', 'returns.approve')).toBe(true);
    });
  });

  describe('isValidPermission', () => {
    it('validates known permission', () => {
      expect(isValidPermission('dashboard.view')).toBe(true);
    });

    it('rejects unknown permission', () => {
      expect(isValidPermission('invalid.permission')).toBe(false);
    });
  });

  describe('DEFAULT_ROLE_PERMISSIONS', () => {
    it('has permissions for all non-super_admin roles', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.admin).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.manager).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.cashier).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.technician).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS.accountant).toBeDefined();
    });

    it('admin has more permissions than cashier', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.admin.length).toBeGreaterThan(
        DEFAULT_ROLE_PERMISSIONS.cashier.length,
      );
    });
  });
});
