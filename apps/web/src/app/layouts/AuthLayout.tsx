import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '@stores/auth.store';

/** Layout for unauthenticated routes (login, etc.). RTL-aware full-screen. */
export function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // If already logged in, redirect to dashboard.
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
