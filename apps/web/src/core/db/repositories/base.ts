/**
 * Repository abstraction layer.
 *
 * Two implementations:
 *  - `OnlineRepository<T>`: calls Supabase via the Worker API. Source of truth.
 *  - `OfflineRepository<T>`: reads from Dexie (local cache). Writes go to Dexie + sync queue.
 *
 * The active repository is chosen at runtime by `RepositoryFactory` based on:
 *  - Network status (navigator.onLine)
 *  - Auth state (logged-in users get online; offline mode falls back to cache)
 *  - User preference (force-offline toggle for debugging)
 *
 * This is the key abstraction that lets us swap Dexie→RxDB→Cloud later without
 * touching business logic in modules.
 */
import type {
  BaseEntity,
  CreateEntityInput,
  PaginatedResult,
  QueryOptions,
  UpdateEntityInput,
  UUID,
} from '@mobile-shop/shared';

/**
 * Generic Repository interface.
 * Every module's data layer implements this — same shape for online/offline.
 */
export interface IRepository<T extends BaseEntity> {
  /** Get a single entity by ID. Returns null if not found (or soft-deleted). */
  findById(id: UUID): Promise<T | null>;

  /** List with pagination, search, sort. */
  list(options?: QueryOptions): Promise<PaginatedResult<T>>;

  /** Create a new entity. Returns the persisted row. */
  create(input: CreateEntityInput<T>): Promise<T>;

  /** Update an existing entity by ID. */
  update(id: UUID, input: UpdateEntityInput<T>): Promise<T>;

  /** Soft-delete (sets deleted_at). */
  delete(id: UUID): Promise<void>;

  /** Restore a soft-deleted entity. */
  restore(id: UUID): Promise<T>;

  /** Bulk upsert — used by sync engine to apply server changes locally. */
  bulkUpsert(items: T[]): Promise<void>;

  /** Subscribe to changes (realtime or polling). Returns an unsubscribe fn. */
  subscribe(callback: (items: T[]) => void): () => void;
}

/**
 * Base class with shared utilities for both online & offline repos.
 * Concrete repos extend this and implement the network/local specifics.
 */
export abstract class BaseRepository<T extends BaseEntity> implements IRepository<T> {
  constructor(
    protected readonly tableName: string,
    protected readonly primaryKey: keyof T = 'id' as keyof T,
  ) {}

  abstract findById(id: UUID): Promise<T | null>;
  abstract list(options?: QueryOptions): Promise<PaginatedResult<T>>;
  abstract create(input: CreateEntityInput<T>): Promise<T>;
  abstract update(id: UUID, input: UpdateEntityInput<T>): Promise<T>;
  abstract delete(id: UUID): Promise<void>;
  abstract restore(id: UUID): Promise<T>;
  abstract bulkUpsert(items: T[]): Promise<void>;
  abstract subscribe(callback: (items: T[]) => void): () => void;
}

/**
 * Factory: returns the active repository based on network & auth state.
 *
 * Modules call:
 *   const repo = RepositoryFactory.get<Customer>('customers');
 *   await repo.list();
 *
 * The factory decides online vs offline internally — modules never know.
 */
export class RepositoryFactory {
  private static registry = new Map<string, IRepository<BaseEntity>>();
  private static builders = new Map<string, () => IRepository<BaseEntity>>();

  static register<T extends BaseEntity>(name: string, builder: () => IRepository<T>): void {
    this.builders.set(name, builder as () => IRepository<BaseEntity>);
  }

  static get<T extends BaseEntity>(name: string): IRepository<T> {
    let repo = this.registry.get(name);
    if (!repo) {
      const builder = this.builders.get(name);
      if (!builder) {
        throw new Error(`Repository "${name}" not registered. Call RepositoryFactory.register first.`);
      }
      repo = builder();
      this.registry.set(name, repo);
    }
    return repo as unknown as IRepository<T>;
  }

  /** Clear cached instances — used on logout / role change. */
  static reset(): void {
    this.registry.clear();
  }
}
