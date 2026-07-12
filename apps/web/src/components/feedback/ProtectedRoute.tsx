/**
 * ProtectedRoute — wraps protected page subtrees.
 *
 * Behavior:
 *  1. If `initializing` (session bootstrapping) → show spinner.
 *  2. If not authenticated → redirect to /login (preserving intended URL).
 *  3. If `permission` prop set and user lacks it → redirect to /unauthorized.
 *  4. Otherwise render the route's children.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@modules/auth/hooks/useAuth';
import { usePermission } from '@core/hooks/usePermission';
import { AppSkeleton } from '@components/layout/AppSkeleton';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  permissions?: string[]; // OR semantics
}

export function ProtectedRoute({ children, permission, permissions }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, initializing } = useAuth();
  const { can, canAny } = usePermission();

  // Bootstrapping — show full-screen loader.
  if (initializing) {
    return <AppSkeleton />;
  }

  // Not authenticated — redirect to login.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Authenticated but lacks permission.
  if (permission && !can(permission)) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (permissions && !canAny(permissions)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
