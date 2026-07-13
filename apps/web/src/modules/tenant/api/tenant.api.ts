/**
 * Tenant API client.
 */
import { api } from '@core/db/api-client';
import type { Tenant, TenantSignupInput } from '@mobile-shop/shared';

export interface TenantSignupResult {
  tenant: Tenant;
  accessToken: string;
  refreshToken: string;
}

export const tenantApi = {
  signup: (input: TenantSignupInput) =>
    api.post<TenantSignupResult>(`/tenants/signup`, input),
  
  getBySlug: (slug: string) =>
    api.get<Tenant | null>(`/tenants/slug/${slug}`),
  
  getMine: () =>
    api.get<Array<{ tenant_id: string; tenant_name: string; tenant_slug: string; role_key: string; is_default: boolean }>>(
      `/tenants/mine`,
    ),
};
