/**
 * Sync types + schemas for cloud synchronization.
 */
import { z } from 'zod';
import { uuidSchema } from './common';

/** Sync direction. */
export type SyncDirection = 'pull' | 'push';

/** Pull request — client asks for changes since last sync. */
export const pullChangesSchema = z.object({
  lastSyncAt: z.string().datetime().optional(),
  tables: z.array(z.string()).optional(), // if omitted, sync all tables
});

export type PullChangesInput = z.infer<typeof pullChangesSchema>;

/** Push request — client sends pending local writes. */
export const pushChangesSchema = z.object({
  changes: z.array(z.object({
    table: z.string(),
    operation: z.enum(['create', 'update', 'delete']),
    data: z.record(z.unknown()),
  })),
});

export type PushChangesInput = z.infer<typeof pushChangesSchema>;

/** Pull response — server returns changed rows per table. */
export interface PullChangesResponse {
  tables: Array<{
    table: string;
    rows: Record<string, unknown>[];
    deleted: string[]; // IDs that were deleted on server
  }>;
  serverTime: string;
  hasMore: boolean;
}

/** Push response — server confirms which changes were applied. */
export interface PushChangesResponse {
  applied: number;
  conflicts: Array<{
    table: string;
    id: string;
    reason: 'stale_revision' | 'not_found' | 'validation_error';
    serverData: Record<string, unknown> | null;
  }>;
  errors: Array<{
    index: number;
    message: string;
  }>;
}

/** Sync log entry — tracks sync operations per tenant. */
export interface SyncLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  direction: SyncDirection;
  status: 'success' | 'partial' | 'failed';
  tables_synced: number;
  rows_pulled: number;
  rows_pushed: number;
  conflicts: number;
  error_message: string | null;
  started_at: string;
  completed_at: string;
}
