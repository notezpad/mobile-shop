/** App-wide constants shared between web & worker. */

export const APP_NAME = 'Mobile Shop ERP';
export const APP_VERSION = '0.1.0';

/** Pagination defaults. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Sync engine tuning. */
export const SYNC_BATCH_SIZE = 50;
export const SYNC_MAX_RETRIES = 5;
export const SYNC_RETRY_BACKOFF_MS = 2000;

/** Session settings. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 min
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PIN_UNLOCK_TTL_SECONDS = 60 * 60 * 4; // 4 hours (offline PIN session)

/** Password policy. */
export const PASSWORD_MIN_LENGTH = 8;
export const PIN_LENGTH = 4;

/** PBKDF2 iteration count for password & PIN hashing (Web Crypto). */
export const PBKDF2_ITERATIONS = 150_000;
export const PBKDF2_SALT_LENGTH = 16;
export const PBKDF2_KEY_LENGTH = 32;

/** Currency formatting. */
export const DEFAULT_CURRENCY = 'EGP';
export const CURRENCY_LOCALE = 'ar-EG';

/** Money precision (all amounts stored as integers in minor units). */
export const MONEY_DECIMALS = 2;

/** Local cache (Dexie) settings. */
export const DEXIE_DB_NAME = 'mobile-shop-local';
export const DEXIE_DB_VERSION = 1;
export const LOCAL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min stale-while-revalidate

/** Audit log retention (90 days, then archived). */
export const AUDIT_LOG_RETENTION_DAYS = 90;

/** API route prefix for the worker. */
export const API_PREFIX = '/api/v1';

/** HTTP headers used by the sync engine. */
export const HEADERS = {
  AUTHORIZATION: 'Authorization',
  X_REVISION: 'X-Revision',
  X_SYNC_STATUS: 'X-Sync-Status',
  X_BRANCH_ID: 'X-Branch-Id',
  X_REQUEST_ID: 'X-Request-Id',
} as const;
