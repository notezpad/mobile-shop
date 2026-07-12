/**
 * useBranches hook — cached list of active branches for selectors/dropdowns.
 *
 * Usage:
 *   const { branches, isLoading } = useBranches();
 *   const mainBranch = useMainBranch();
 */
import { useQuery } from '@tanstack/react-query';
import { branchesApi } from '../api/branches.api';
import type { Branch } from '@mobile-shop/shared';

/** Cached list of all active branches (used in dropdowns). */
export function useBranches() {
  return useQuery({
    queryKey: ['branches', 'active'],
    queryFn: branchesApi.listActive,
    staleTime: 5 * 60 * 1000, // 5 min — branches rarely change
  });
}

/** Find a branch by ID (uses cached list). */
export function useBranch(id?: string | null): Branch | undefined {
  const { data: branches = [] } = useBranches();
  if (!id) return undefined;
  return branches.find((b) => b.id === id);
}

/** Main branch (cached). */
export function useMainBranch(): Branch | undefined {
  const { data: branches = [] } = useBranches();
  return branches.find((b) => b.is_main);
}
