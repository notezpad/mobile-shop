/**
 * Domain entity types — one file per module.
 * These mirror the Supabase tables exactly.
 * The actual Zod validation schemas live in `packages/shared/src/schemas/`.
 */
export * from './base';
export * from './auth';
export * from './tenant';
export * from './catalog';
export * from './inventory';
export * from './sales';
export * from './repairs';
export * from './finance';
export * from './people';
