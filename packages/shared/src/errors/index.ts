/**
 * Standard error codes for the entire system.
 * Worker throws AppError → middleware converts to API response.
 * Web client reads `error.code` and shows localized message.
 */
export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_NO_SESSION: 'AUTH_NO_SESSION',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_PIN_LOCKED: 'AUTH_PIN_LOCKED',
  AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',

  // Domain
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  DEVICE_ALREADY_SOLD: 'DEVICE_ALREADY_SOLD',
  INVALID_IMEI: 'INVALID_IMEI',
  CASHBOX_CLOSED: 'CASHBOX_CLOSED',
  RETURN_WINDOW_CLOSED: 'RETURN_WINDOW_CLOSED',

  // Sync
  SYNC_CONFLICT: 'SYNC_CONFLICT',
  SYNC_REVISION_STALE: 'SYNC_REVISION_STALE',

  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  OFFLINE: 'OFFLINE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** HTTP status code mapping for each error code. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_NO_SESSION: 401,
  AUTH_ACCOUNT_SUSPENDED: 403,
  AUTH_PIN_LOCKED: 403,
  AUTH_PERMISSION_DENIED: 403,
  VALIDATION_ERROR: 422,
  INVALID_PAYLOAD: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  BUSINESS_RULE_VIOLATION: 422,
  INSUFFICIENT_STOCK: 422,
  INSUFFICIENT_BALANCE: 422,
  DEVICE_ALREADY_SOLD: 422,
  INVALID_IMEI: 422,
  CASHBOX_CLOSED: 422,
  RETURN_WINDOW_CLOSED: 422,
  SYNC_CONFLICT: 409,
  SYNC_REVISION_STALE: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  RATE_LIMIT_EXCEEDED: 429,
  OFFLINE: 503,
};

/** App-level error class — used by both worker and web. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_HTTP_STATUS[code];
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
