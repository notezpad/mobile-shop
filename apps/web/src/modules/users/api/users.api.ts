/**
 * Users API client.
 */
import { api, API_PREFIX } from '@core/db/api-client';
import type {
  User,
  PaginatedResult,
  CreateUserInput,
  UpdateUserInput,
  UserQuery,
} from '@mobile-shop/shared';

export const usersApi = {
  list(query: UserQuery): Promise<PaginatedResult<User>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.roleId) params.set('roleId', query.roleId);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.status) params.set('status', query.status);
    return api.get<PaginatedResult<User>>(`${API_PREFIX}/users?${params.toString()}`);
  },

  get(id: string): Promise<User> {
    return api.get<User>(`${API_PREFIX}/users/${id}`);
  },

  create(input: CreateUserInput): Promise<User> {
    return api.post<User>(`${API_PREFIX}/users`, input);
  },

  update(id: string, input: UpdateUserInput): Promise<User> {
    return api.patch<User>(`${API_PREFIX}/users/${id}`, input);
  },

  resetPassword(id: string, newPassword: string): Promise<null> {
    return api.post<null>(`${API_PREFIX}/users/${id}/reset-password`, { newPassword });
  },

  setPin(id: string, pin: string): Promise<null> {
    return api.post<null>(`${API_PREFIX}/users/${id}/pin`, { pin });
  },

  delete(id: string): Promise<null> {
    return api.delete<null>(`${API_PREFIX}/users/${id}`);
  },
};
