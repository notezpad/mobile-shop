/**
 * Settings API client.
 */
import { api } from '@core/db/api-client';
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
    return api.get<Setting[]>(`/settings${qs ? `?${qs}` : ''}`);
  },

  upsert(input: UpsertSettingInput): Promise<Setting> {
    return api.post<Setting>(`/settings`, input);
  },

  batchUpsert(inputs: UpsertSettingInput[]): Promise<Setting[]> {
    return api.post<Setting[]>(`/settings/batch`, { settings: inputs });
  },

  seedDefaults(): Promise<{ inserted: number }> {
    return api.post<{ inserted: number }>(`/settings/seed-defaults`, {});
  },
};
