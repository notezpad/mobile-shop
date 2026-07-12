/**
 * RBAC middleware factory — checks if the current user has a specific permission.
 *
 * Usage:
 *   app.post('/users', authMiddleware, requirePermission('users.create'), handler);
 *
 * Notes:
 *  - Always used AFTER authMiddleware (which sets `user` in context).
 *  - Super_admin bypasses all checks (its permissions array includes every key).
 */
import type { MiddlewareHandler } from 'hono';
import { AppError, ERROR_CODES, type PermissionKey } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { requireUser } from './auth';

export function requirePermission(permission: PermissionKey): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const user = requireUser(c);

    // super_admin and admin bypass all permission checks.
    if (user.roleKey === 'super_admin' || user.roleKey === 'admin') {
      await next();
      return;
    }

    if (!user.permissions.includes(permission)) {
      throw new AppError(
        ERROR_CODES.AUTH_PERMISSION_DENIED,
        'ليس لديك صلاحية للقيام بهذا الإجراء',
        { required: permission },
      );
    }

    await next();
  };
}

/** Check any of the given permissions (OR semantics). */
export function requireAnyPermission(
  ...permissions: PermissionKey[]
): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const user = requireUser(c);

    // super_admin and admin bypass all permission checks.
    if (user.roleKey === 'super_admin' || user.roleKey === 'admin') {
      await next();
      return;
    }

    const hasAny = permissions.some((p) => user.permissions.includes(p));
    if (!hasAny) {
      throw new AppError(
        ERROR_CODES.AUTH_PERMISSION_DENIED,
        'ليس لديك صلاحية للقيام بهذا الإجراء',
        { required: permissions },
      );
    }

    await next();
  };
}
