import Dexie, { type Table } from 'dexie';
import { DEXIE_DB_NAME, DEXIE_DB_VERSION } from '@mobile-shop/shared';
import type {
  BaseEntity,
  Branch,
  Category,
  Customer,
  Product,
  Role,
  User,
} from '@mobile-shop/shared';

/**
 * Local IndexedDB cache via Dexie.
 *
 * Purpose:
 *  - Mirror frequently-read reference data (products, customers, branches, roles,
 *    current user) for instant offline access.
 *  - Stage pending writes when offline (sync queue) — pushed by Background Sync.
 *  - Cache list-query results with TTL to reduce network round-trips.
 *
 * Schema versioning:
 *  - Bump DEXIE_DB_VERSION in @mobile-shop/shared when changing indexes.
 *  - Dexie auto-migrates; never remove indexes — only add new ones.
 */
export interface LocalCacheMeta {
  key: string; // `${table}:${id}` or `query:${hash}`
  updated_at: string;
  ttl_ms: number;
}

export interface SyncQueueEntry {
  id?: number; // auto-increment
  entity: string;
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
  created_at: string;
  next_retry_at: string;
}

class MobileShopLocalDB extends Dexie {
  // Reference data — read-mostly, refreshed from server.
  branches!: Table<Branch, string>;
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;

  // Auth/RBAC — minimal cache for offline auth.
  users!: Table<User, string>;
  roles!: Table<Role, string>;

  // Sync engine.
  sync_queue!: Table<SyncQueueEntry, number>;
  cache_meta!: Table<LocalCacheMeta, string>;

  constructor() {
    super(DEXIE_DB_NAME);
    this.version(DEXIE_DB_VERSION).stores({
      // BaseEntity indexes always: id (pk), updated_at, deleted_at, sync_status, revision.
      branches: 'id, updated_at, deleted_at, sync_status, is_main',
      categories: 'id, updated_at, deleted_at, sync_status, parent_id, slug, sort_order',
      products:
        'id, updated_at, deleted_at, sync_status, category_id, sku, barcode, name, is_active',
      customers: 'id, updated_at, deleted_at, sync_status, phone, name, code, is_active',

      users: 'id, updated_at, deleted_at, sync_status, username, role_id, branch_id, status',
      roles: 'id, updated_at, deleted_at, sync_status, key',

      // Auto-incrementing id for the queue.
      sync_queue: '++id, entity, entity_id, operation, created_at, next_retry_at, attempts',
      cache_meta: 'key, updated_at, ttl_ms',
    });
  }
}

/** Singleton instance — one DB per browser tab. */
let dbInstance: MobileShopLocalDB | null = null;

export function getLocalDb(): MobileShopLocalDB {
  if (!dbInstance) {
    dbInstance = new MobileShopLocalDB();
  }
  return dbInstance;
}

/** Reset entire local cache (used on logout / data wipe). */
export async function clearLocalDb(): Promise<void> {
  const db = getLocalDb();
  await db.delete();
  dbInstance = null;
  dbInstance = new MobileShopLocalDB();
}

/** Type helper: extract the local row type from a table name. */
export type LocalTable = keyof Omit<MobileShopLocalDB, 'sync_queue' | 'cache_meta'>;

/** Type helper: row type for a given table. */
export type LocalRow<T extends LocalTable> = MobileShopLocalDB[T] extends Table<infer R, string>
  ? R
  : never;

/** Type guard: ensure an object matches BaseEntity shape (loose check). */
export function isBaseEntity(obj: unknown): obj is BaseEntity {
  if (typeof obj !== 'object' || obj === null) return false;
  return (
    'id' in obj &&
    'created_at' in obj &&
    'updated_at' in obj &&
    'deleted_at' in obj &&
    'revision' in obj &&
    'sync_status' in obj
  );
}
