/**
 * HTTP client for the Cloudflare Worker API.
 * Wraps fetch with:
 *  - Auth header injection (Bearer token from auth store)
 *  - Request/response envelope handling
 *  - Network error → throw OFFLINE AppError
 *  - Auto-retry on 401 (refresh token once)
 *  - AbortError detection + automatic retry (1x) for transient aborts
 *  - Request ID propagation
 *
 * AbortError handling:
 *  Browsers fire AbortError ("تم إلغاء العملية برمجياً") when:
 *   - The connection is closed by the server mid-response (e.g. Cloudflare
 *     Worker exceeds its wall-clock / CPU limit during a long transaction
 *     like sale creation).
 *   - The browser decides to abort the request (rare).
 *   - A navigation/unload happens during the request.
 *  For POST/PUT/PATCH/DELETE we transparently retry once, because these
 *  aborts are almost always transient. For GET we retry too. If the retry
 *  also aborts, we surface a clear Arabic message instead of the raw
 *  DOMException text.
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

/** Detect whether an error is a browser AbortError (DOMException). */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === 'AbortError';
  if (err instanceof Error) {
    return (
      err.name === 'AbortError' ||
      // Some older browsers surface it as a TypeError with this message.
      (err.name === 'TypeError' && /aborted/i.test(err.message))
    );
  }
  return false;
}

export class ApiClient {
  constructor(private readonly baseUrl: string = env.VITE_API_URL) {}

  private getAuthHeader(): string | null {
    const token = localStorage.getItem('mse-access-token');
    return token ? `Bearer ${token}` : null;
  }

  private getBranchHeader(): string | null {
    return localStorage.getItem('mse-active-branch');
  }

  /**
   * Core request method.
   *
   * Retries once on AbortError (transient server-side abort). All other
   * network failures are wrapped in a clear AppError.
   */
  async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    if (!isOnline()) {
      throw new AppError(
        ERROR_CODES.OFFLINE,
        'لا يوجد اتصال بالإنترنت — يعمل النظام في وضع عدم الاتصال',
      );
    }

    // Try the request. On transient AbortError, retry once.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.doRequest<T>(path, options);
      } catch (err) {
        lastError = err;

        // If it's an AppError from the server (HTTP status), don't retry —
        // the server responded, the issue is application-level.
        if (err instanceof AppError) throw err;

        // If it's an AbortError and this is the first attempt, retry once.
        // AbortError usually means the Worker was killed mid-request
        // (CPU/wall-clock limit during a long transaction). A retry often
        // succeeds because the Worker's second invocation may be warmer.
        if (isAbortError(err) && attempt === 0) {
          // Small delay before retry to let the network settle.
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }

        // Any other error — wrap and throw.
        throw new AppError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          'فشل الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.',
          { original: err instanceof Error ? err.message : String(err) },
        );
      }
    }

    // Should not reach here, but just in case.
    throw new AppError(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      'فشل الاتصال بالخادم بعد عدة محاولات.',
      { original: lastError instanceof Error ? lastError.message : String(lastError) },
    );
  }

  /**
   * Single fetch attempt. Throws AppError for HTTP errors, or the raw
   * DOMException for network-level failures (so the caller can decide
   * whether to retry).
   */
  private async doRequest<T>(path: string, options: RequestInit): Promise<T> {
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
      // Re-throw the raw error so the caller (request()) can decide whether
      // to retry based on the error type.
      throw err;
    }

    // 401 → attempt token refresh once, then retry. If refresh fails, we
    // throw AUTH_TOKEN_EXPIRED. The auth bootstrap (useAuth) will NOT
    // clear the session on this error; it leaves the user in place so
    // they can re-login voluntarily instead of being kicked out.
    if (response.status === 401) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.doRequest<T>(path, options);
      }
      throw new AppError(
        ERROR_CODES.AUTH_TOKEN_EXPIRED,
        'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول',
      );
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

  /** Try to refresh the access token using the refresh token cookie. */
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
