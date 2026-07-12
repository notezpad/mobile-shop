/**
 * @mobile-shop/shared
 * Single source of truth for: types, Zod schemas, RBAC matrix, constants, errors.
 * Imported by both `apps/web` (frontend) and `apps/worker` (backend).
 */
export * from './types';
export * from './schemas';
export * from './constants';
export * from './permissions';
export * from './errors';
