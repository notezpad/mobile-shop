/**
 * Base entity types shared across the entire system.
 * All DB tables extend `BaseEntity` to guarantee consistency for:
 *  - Primary key (UUID, generated client-side for offline-first)
 *  - Tenant isolation (tenant_id — SaaS multi-tenancy)
 *  - Soft-delete (deleted_at) — required for sync + audit
 *  - Sync metadata (revision, sync_status) — required for offline-first sync
 *  - Audit timestamps (created_at, updated_at)
 */

/** UUID v4 string. Generated client-side using crypto.randomUUID(). */
export type UUID = string;

/** ISO 8601 timestamp string. */
export type ISODate = string;

/** Sync status for offline-first writes. */
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

/**
 * Every table in the system MUST extend this interface.
 * These fields are populated by the Repository layer automatically —
 * business code never sets them directly.
 */
export interface BaseEntity {
  /** UUID primary key (generated client-side). */
  id: UUID;

  /** Tenant ID — SaaS multi-tenancy. Set by the Worker middleware. */
  tenant_id: UUID | null;

  /** Creation timestamp (UTC ISO). */
  created_at: ISODate;

  /** Last modification timestamp (UTC ISO). Used for conflict resolution. */
  updated_at: ISODate;

  /** Soft-delete timestamp. NULL = active; non-NULL = archived. */
  deleted_at: ISODate | null;

  /** Monotonic revision counter for sync conflict detection. */
  revision: number;

  /** Current sync state of this row. */
  sync_status: SyncStatus;

  /** ID of the user who last modified this row (for audit). */
  created_by: UUID | null;
  updated_by: UUID | null;
}

/** Payload for creating a new entity (excludes auto-generated fields). */
export type CreateEntityInput<T> = Omit<
  T,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'revision'
  | 'sync_status'
  | 'created_by'
  | 'updated_by'
>;

/** Payload for updating an entity (all fields optional, partial). */
export type UpdateEntityInput<T> = Partial<CreateEntityInput<T>>;

/** Query options for list endpoints (pagination + filters base). */
export interface QueryOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/** Standard paginated response. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Standard API response envelope. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    revision?: number;
  };
}
