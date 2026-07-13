/**
 * Repairs API client + hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@core/db/api-client';
import type {
  RepairWithDetails,
  RepairTrackingInfo,
  PaginatedResult,
  CreateRepairInput,
  UpdateRepairInput,
  ChangeRepairStatusInput,
  AddRepairPartInput,
  DeliverRepairInput,
  RepairQuery,
} from '@mobile-shop/shared';

export const repairsApi = {
  list(query: RepairQuery): Promise<PaginatedResult<RepairWithDetails>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.customerId) params.set('customerId', query.customerId);
    if (query.technicianId) params.set('technicianId', query.technicianId);
    if (query.status) params.set('status', query.status);
    if (query.fromDate) params.set('fromDate', query.fromDate);
    if (query.toDate) params.set('toDate', query.toDate);
    return api.get(`/repairs?${params.toString()}`);
  },

  get(id: string): Promise<RepairWithDetails> {
    return api.get(`/repairs/${id}`);
  },

  getByTicketNo(ticketNo: string): Promise<RepairWithDetails> {
    return api.get(`/repairs/ticket/${ticketNo}`);
  },

  create(input: CreateRepairInput): Promise<RepairWithDetails> {
    return api.post(`/repairs`, input);
  },

  update(id: string, input: UpdateRepairInput): Promise<RepairWithDetails> {
    return api.patch(`/repairs/${id}`, input);
  },

  changeStatus(id: string, input: ChangeRepairStatusInput): Promise<RepairWithDetails> {
    return api.post(`/repairs/${id}/status`, input);
  },

  addPart(id: string, input: AddRepairPartInput): Promise<RepairWithDetails> {
    return api.post(`/repairs/${id}/parts`, input);
  },

  removePart(id: string, partId: string): Promise<RepairWithDetails> {
    return api.delete(`/repairs/${id}/parts/${partId}`);
  },

  deliver(id: string, input: DeliverRepairInput): Promise<RepairWithDetails> {
    return api.post(`/repairs/${id}/deliver`, input);
  },
};

/** Public tracking — no auth required. */
export const repairTrackingApi = {
  track(ticketNo: string): Promise<RepairTrackingInfo> {
    return api.get(`/repair-tracking/track/${ticketNo}`);
  },
};

/** Repairs list. */
export function useRepairs(query: RepairQuery) {
  return useQuery({
    queryKey: ['repairs', query],
    queryFn: () => repairsApi.list(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Single repair. */
export function useRepair(id?: string | null) {
  return useQuery({
    queryKey: ['repair', id],
    queryFn: () => repairsApi.get(id!),
    enabled: !!id,
  });
}

/** Public tracking info. */
export function useRepairTracking(ticketNo?: string | null) {
  return useQuery({
    queryKey: ['repair-tracking', ticketNo],
    queryFn: () => repairTrackingApi.track(ticketNo!),
    enabled: !!ticketNo,
  });
}

export type { RepairWithDetails, RepairTrackingInfo };
