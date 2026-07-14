/**
 * useAuth hook — primary entry point for authentication state.
 *
 * Responsibilities:
 *  - Wrap the auth Zustand store with action methods.
 *  - Auto-load session from /auth/me on app mount (if accessToken present).
 *  - Sync accessToken to localStorage for the ApiClient.
 *
 * Resilience policy (refresh-friendly):
 *  - If we have a stored user + accessToken after hydration, the user is
 *    considered authenticated IMMEDIATELY — `initializing` flips to false
 *    without waiting for /auth/me.
 *  - /auth/me is fired in the background to refresh user data; failures
 *    are surfaced as soft warnings, NOT forced logouts.
 *  - We only clear the session on AUTH_NO_SESSION (user was deleted/disabled
 *    server-side). For AUTH_TOKEN_EXPIRED, we let the next real API call's
 *    401 handler try refresh-and-retry — never log the user out proactively.
 *  - Network errors are always non-fatal.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@stores/auth.store';
import { authApi } from '../api/auth.api';
import type { LoginInput } from '@mobile-shop/shared';
import { toast } from 'sonner';
import { AppError, ERROR_CODES } from '@mobile-shop/shared';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Bootstrap: if we have an accessToken in store, validate it via /auth/me.
  useEffect(() => {
    if (!isHydrated) return;

    // No stored token → not authenticated, finish initializing immediately.
    if (!accessToken) {
      setInitializing(false);
      return;
    }

    // Persist token to localStorage for ApiClient to pick up.
    localStorage.setItem('mse-access-token', accessToken);

    // If we already have a user in the store (typical on refresh), don't
    // block the UI — let the user in immediately while /auth/me runs in
    // the background. This is what makes refresh "stick".
    if (user) {
      setInitializing(false);
    }

    let cancelled = false;
    (async () => {
      try {
        const session = await authApi.me();
        if (cancelled) return;
        // Refresh user data + rotate token if backend returned a new one.
        setSession({
          user: session.user,
          accessToken: session.accessToken || accessToken,
        });
      } catch (err) {
        if (cancelled) return;

        // Soft-fail policy: only force-logout if the server explicitly says
        // the user no longer exists / is suspended. For all other errors
        // (expired token, network blip, server error), keep the local
        // session intact — the next real API call will handle 401 via
        // its own refresh-and-retry flow.
        if (err instanceof AppError) {
          const fatalErrors = [
            ERROR_CODES.AUTH_NO_SESSION,
            ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
          ];
          if (fatalErrors.includes(err.code as typeof ERROR_CODES.AUTH_NO_SESSION)) {
            clearSession();
            localStorage.removeItem('mse-access-token');
          }
          // AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID / network errors →
          // keep session, surface a soft warning.
          if (err.code === ERROR_CODES.AUTH_TOKEN_EXPIRED) {
            // Try an explicit refresh once — if it works, great; if not,
            // we still keep the local session so the user isn't kicked
            // out without warning.
            try {
              const refreshed = await authApi.refresh();
              if (refreshed?.accessToken) {
                localStorage.setItem('mse-access-token', refreshed.accessToken);
                setSession({ user: user!, accessToken: refreshed.accessToken });
              }
            } catch {
              // Soft-fail: let the next API call handle it.
            }
          }
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isHydrated]);

  /** Login with username + password. */
  const login = useCallback(
    async (input: LoginInput) => {
      setLoading(true);
      try {
        const session = await authApi.login(input);
        localStorage.setItem('mse-access-token', session.accessToken);
        setSession({ user: session.user, accessToken: session.accessToken });
        toast.success(`أهلاً ${session.user.fullName} 👋`);
        return session;
      } catch (err) {
        const message =
          err instanceof AppError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'فشل تسجيل الدخول';
        toast.error(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setSession],
  );

  /** Logout — clear session + cookie. */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore network errors on logout — clear local state regardless.
    }
    localStorage.removeItem('mse-access-token');
    clearSession();
    toast.success('تم تسجيل الخروج');
  }, [clearSession]);

  return {
    user,
    accessToken,
    isAuthenticated,
    initializing,
    loading,
    login,
    logout,
  };
}
