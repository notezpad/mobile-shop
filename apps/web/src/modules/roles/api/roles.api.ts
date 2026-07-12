/**
 * Roles & permissions API client.
 */
import { api, API_PREFIX } from '@core/db/api-client';
import type { Role, Permission, CreateRoleInput, UpdateRoleInput } from '@mobile-shop/shared';

export const rolesApi = {
  list(): Promise<Role[]> {
    return api.get<Role[]>(`${API_PREFIX}/roles`);
  },

  get(id: string): Promise<{ role: Role; permissions: Permission[] }> {
    return api.get(`${API_PREFIX}/roles/${id}`);
  },

  create(input: CreateRoleInput): Promise<Role> {
    return api.post<Role>(`${API_PREFIX}/roles`, input);
  },

  update(id: string, input: UpdateRoleInput): Promise<Role> {
    return api.patch<Role>(`${API_PREFIX}/roles/${id}`, input);
  },

  assignPermissions(id: string, permissionIds: string[]): Promise<Permission[]> {
    return api.put<Permission[]>(`${API_PREFIX}/roles/${id}/permissions`, { permissionIds });
  },

  delete(id: string): Promise<null> {
    return api.delete<null>(`${API_PREFIX}/roles/${id}`);
  },
};

export const permissionsApi = {
  list(): Promise<Permission[]> {
    return api.get<Permission[]>(`${API_PREFIX}/permissions`);
  },
};
