/**
 * Settings API client.
 */
import { api, API_PREFIX } from '@core/db/api-client';
import type {
  Setting,
  SettingCategory,
  UpsertSettingInput,
} from '@mobile-shop/shared';

export const settingsApi = {
  list(filters: { category?: SettingCategory; branchId?: string } = {}): Promise<Setting[]> {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.branchId) params.set('branchId', filters.branchId);
    const qs = params.toString();
    return api.get<Setting[]>(`${API_PREFIX}/settings${qs ? `?${qs}` : ''}`);
  },

  upsert(input: UpsertSettingInput): Promise<Setting> {
    return api.post<Setting>(`${API_PREFIX}/settings`, input);
  },

  batchUpsert(inputs: UpsertSettingInput[]): Promise<Setting[]> {
    return api.post<Setting[]>(`${API_PREFIX}/settings/batch`, { settings: inputs });
  },

  seedDefaults(): Promise<{ inserted: number }> {
    return api.post<{ inserted: number }>(`${API_PREFIX}/settings/seed-defaults`, {});
  },
};
