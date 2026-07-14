/**
 * HTTP client for the Cloudflare Worker API.
 * Wraps fetch with:
 *  - Auth header injection (Bearer token from auth store)
 *  - Request/response envelope handling
 *  - Network error → throw OFFLINE AppError
 *  - Auto-retry on 401 (refresh token once)
 *  - Request ID propagation
 */
import {
  API_PREFIX,
  ApiResponse,
  AppError,
  ERROR_CODES,
  HEADERS,
} from '@mobile-shop/shared';
import { env } from '../config/env';
import { isOnline } from '../utils/cn';

export class ApiClient {
  constructor(private readonly baseUrl: string = env.VITE_API_URL) {}

  private getAuthHeader(): string | null {
    const token = localStorage.getItem('mse-access-token');
    return token ? `Bearer ${token}` : null;
  }

  private getBranchHeader(): string | null {
    return localStorage.getItem('mse-active-branch');
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    if (!isOnline()) {
      throw new AppError(ERROR_CODES.OFFLINE, 'No internet connection. Operating in offline mode.');
    }

    const url = `${this.baseUrl}${path}`;
    const authHeader = this.getAuthHeader();
    const branchHeader = this.getBranchHeader();
    const requestId = crypto.randomUUID();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      [HEADERS.X_REQUEST_ID]: requestId,
      ...(branchHeader ? { [HEADERS.X_BRANCH_ID]: branchHeader } : {}),
      ...(authHeader ? { [HEADERS.AUTHORIZATION]: authHeader } : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, credentials: 'include' });
    } catch (err) {
      throw new AppError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Network request failed. Check your connection.',
        { original: err instanceof Error ? err.message : String(err) },
      );
    }

    // 401 → attempt token refresh once, then retry. If refresh fails, we
    // still throw AUTH_TOKEN_EXPIRED — but the auth bootstrap (useAuth)
    // will NOT clear the session on this error; it leaves the user in
    // place and surfaces a soft warning, so they can re-login voluntarily
    // instead of being silently kicked out on every refresh.
    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request<T>(path, options);
      }
      throw new AppError(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول');
    }

    const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;

    if (!response.ok || !body?.success) {
      const error = body?.error ?? {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `HTTP ${response.status}`,
      };
      throw new AppError(error.code as never, error.message, error.details);
    }

    return body.data as T;
  }

  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: 'GET', signal });
  }

  post<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data !== undefined ? JSON.stringify(data) : undefined,
      signal,
    });
  }

  put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /** Try to refresh the access token using the refresh token. */
  private async tryRefreshToken(): Promise<boolean> {
    try {
      const refreshResponse = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!refreshResponse.ok) return false;
      const body = (await refreshResponse.json()) as ApiResponse<{
        accessToken: string;
      }>;
      if (!body.success || !body.data) return false;
      localStorage.setItem('mse-access-token', body.data.accessToken);
      return true;
    } catch {
      return false;
    }
  }
}

/** Singleton instance. */
let apiClient: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!apiClient) apiClient = new ApiClient();
  return apiClient;
}

/** Convenience helper. */
export const api = {
  get: <T>(path: string, signal?: AbortSignal) => getApiClient().get<T>(path, signal),
  post: <T>(path: string, data?: unknown) => getApiClient().post<T>(path, data),
  put: <T>(path: string, data?: unknown) => getApiClient().put<T>(path, data),
  patch: <T>(path: string, data?: unknown) => getApiClient().patch<T>(path, data),
  delete: <T>(path: string) => getApiClient().delete<T>(path),
};

/** Re-export API_PREFIX for module route definitions. */
export { API_PREFIX };
