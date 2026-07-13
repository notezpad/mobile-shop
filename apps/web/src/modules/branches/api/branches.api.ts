/**
 * Branches API client.
 */
import { api } from '@core/db/api-client';
import type {
  Branch,
  PaginatedResult,
  CreateBranchInput,
  UpdateBranchInput,
  BranchQuery,
} from '@mobile-shop/shared';

export const branchesApi = {
  list(query: BranchQuery): Promise<PaginatedResult<Branch>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.isActive !== undefined) params.set('isActive', query.isActive);
    return api.get<PaginatedResult<Branch>>(`/branches?${params.toString()}`);
  },

  /** Lightweight list for dropdown selectors — active branches only. */
  listActive(): Promise<Branch[]> {
    return api.get<Branch[]>(`/branches/active`);
  },

  get(id: string): Promise<Branch> {
    return api.get<Branch>(`/branches/${id}`);
  },

  create(input: CreateBranchInput): Promise<Branch> {
    return api.post<Branch>(`/branches`, input);
  },

  update(id: string, input: UpdateBranchInput): Promise<Branch> {
    return api.patch<Branch>(`/branches/${id}`, input);
  },

  delete(id: string): Promise<null> {
    return api.delete<null>(`/branches/${id}`);
  },
};
