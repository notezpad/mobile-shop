/**
 * Roles & permissions API client.
 */
import { api } from '@core/db/api-client';
import type { Role, Permission, CreateRoleInput, UpdateRoleInput } from '@mobile-shop/shared';

export const rolesApi = {
  list(): Promise<Role[]> {
    return api.get<Role[]>(`/roles`);
  },

  get(id: string): Promise<{ role: Role; permissions: Permission[] }> {
    return api.get(`/roles/${id}`);
  },

  create(input: CreateRoleInput): Promise<Role> {
    return api.post<Role>(`/roles`, input);
  },

  update(id: string, input: UpdateRoleInput): Promise<Role> {
    return api.patch<Role>(`/roles/${id}`, input);
  },

  assignPermissions(id: string, permissionIds: string[]): Promise<Permission[]> {
    return api.put<Permission[]>(`/roles/${id}/permissions`, { permissionIds });
  },

  delete(id: string): Promise<null> {
    return api.delete<null>(`/roles/${id}`);
  },
};

export const permissionsApi = {
  list(): Promise<Permission[]> {
    return api.get<Permission[]>(`/permissions`);
  },
};
