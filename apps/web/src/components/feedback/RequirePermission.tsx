/**
 * RequirePermission — wrapper that hides children if the current user lacks
 * the required permission. Optionally shows a fallback.
 *
 * For route-level protection, use `<ProtectedRoute>` instead.
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermission } from '@core/hooks/usePermission';
import { ShieldX } from 'lucide-react';

interface RequirePermissionProps {
  permission?: string;
  permissions?: string[]; // OR semantics
  children: ReactNode;
  fallback?: ReactNode;
  redirectOnFail?: boolean; // if true, redirect to /unauthorized; if false, hide
}

export function RequirePermission({
  permission,
  permissions,
  children,
  fallback,
  redirectOnFail = false,
}: RequirePermissionProps) {
  const { can, canAny } = usePermission();

  const allowed = permission
    ? can(permission)
    : permissions
      ? canAny(permissions)
      : true;

  if (allowed) return <>{children}</>;

  if (redirectOnFail) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (fallback) return <>{fallback}</>;

  // Default fallback: a subtle "no permission" inline notice.
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <ShieldX className="size-3.5" />
      <span>ليس لديك صلاحية للوصول لهذا الإجراء</span>
    </div>
  );
}
