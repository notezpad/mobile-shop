/**
 * Permission hooks — for component-level permission gating.
 *
 * Usage:
 *   const { can, canAny } = usePermission();
 *   if (can('users.create')) { ... }
 *
 * Or as a wrapper component:
 *   <RequirePermission permission="users.create">
 *     <Button>إضافة مستخدم</Button>
 *   </RequirePermission>
 */
import { useAuthStore } from '@stores/auth.store';
import type { PermissionKey } from '@mobile-shop/shared';

export function usePermission() {
  const user = useAuthStore((s) => s.user);

  const can = (permission: PermissionKey | string): boolean => {
    if (!user) return false;
    if (user.roleKey === 'super_admin' || user.roleKey === 'admin') return true;
    return user.permissions.includes(permission);
  };

  const canAny = (permissions: (PermissionKey | string)[]): boolean => {
    if (!user) return false;
    if (user.roleKey === 'super_admin' || user.roleKey === 'admin') return true;
    return permissions.some((p) => user.permissions.includes(p));
  };

  const canAll = (permissions: (PermissionKey | string)[]): boolean => {
    if (!user) return false;
    if (user.roleKey === 'super_admin' || user.roleKey === 'admin') return true;
    return permissions.every((p) => user.permissions.includes(p));
  };

  return { can, canAny, canAll };
}
