/**
 * Auth API client — thin wrappers around the core ApiClient for auth endpoints.
 *
 * All endpoints return the typed `SessionResponse` shape (validated server-side
 * by Zod in the worker).
 */
import { api } from '@core/db/api-client';
import type {
  SessionResponse,
  LoginInput,
  ChangePasswordInput,
} from '@mobile-shop/shared';

export const authApi = {
  /** Login with username + password. Returns session + sets refresh cookie (httpOnly). */
  login(input: LoginInput): Promise<SessionResponse> {
    return api.post<SessionResponse>(`/auth/login`, input);
  },

  /** Exchange refresh token (cookie) for a new access token. */
  refresh(): Promise<{ accessToken: string; expiresIn: number }> {
    return api.post(`/auth/refresh`, {});
  },

  /** Logout — clears refresh cookie, audit log entry written server-side. */
  logout(): Promise<null> {
    return api.post<null>(`/auth/logout`);
  },

  /** Fetch the current user (requires Authorization header). */
  me(): Promise<SessionResponse> {
    return api.get<SessionResponse>(`/auth/me`);
  },

  /** Change own password. */
  changePassword(input: ChangePasswordInput): Promise<null> {
    return api.post<null>(`/auth/change-password`, input);
  },
};
