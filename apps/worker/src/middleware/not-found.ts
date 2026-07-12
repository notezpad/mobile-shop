import type { Context, MiddlewareHandler } from 'hono';
import { AppError, ERROR_CODES } from '@mobile-shop/shared';
import type { AppContext } from '../types/env';

/**
 * Fallback 404 — any unmatched route returns our standard envelope.
 * Mounted after all routes so it only fires for unknown paths.
 */
export const notFoundMiddleware: MiddlewareHandler<AppContext> = (c: Context<AppContext>) => {
  throw new AppError(ERROR_CODES.NOT_FOUND, `Route not found: ${c.req.method} ${c.req.path}`);
};
