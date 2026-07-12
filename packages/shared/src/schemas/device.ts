import { z } from 'zod';
import { nonEmptyString, uuidSchema, imeiSchema } from './common';

export const deviceUnitStatusSchema = z.enum([
  'in_stock',
  'reserved',
  'sold',
  'returned',
  'defective',
]);

// Note: `DeviceUnitStatus` type is defined in types/catalog.ts (shared with the
// types module). The Zod schema above validates the same shape at runtime.

export const createDeviceUnitSchema = z.object({
  productId: uuidSchema,
  imei1: imeiSchema,
  imei2: imeiSchema.optional().nullable(),
  serialNumber: z.string().max(100).nullable().optional(),
  branchId: uuidSchema,
  cost: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
});

export type CreateDeviceUnitInput = z.infer<typeof createDeviceUnitSchema>;

/** Batch import — multiple IMEIs for the same product + branch. */
export const batchCreateDeviceUnitsSchema = z.object({
  productId: uuidSchema,
  branchId: uuidSchema,
  cost: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
  imeis: z.array(imeiSchema).min(1, 'أدخل IMEI واحد على الأقل').max(500, 'حد أقصى 500 IMEI'),
});

export type BatchCreateDeviceUnitsInput = z.infer<typeof batchCreateDeviceUnitsSchema>;

export const updateDeviceUnitSchema = z.object({
  status: deviceUnitStatusSchema.optional(),
  cost: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().min(0).optional(),
  branchId: uuidSchema.optional(),
});

export type UpdateDeviceUnitInput = z.infer<typeof updateDeviceUnitSchema>;

export const deviceUnitQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(), // search by IMEI/serial
  productId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  status: deviceUnitStatusSchema.optional(),
  sortBy: z.enum(['imei1', 'receivedAt', 'cost', 'salePrice', 'status']).default('receivedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type DeviceUnitQuery = z.infer<typeof deviceUnitQuerySchema>;

/** Result of batch IMEI import. */
export interface BatchImportResult {
  inserted: number;
  duplicates: string[]; // IMEIs that already exist
  invalid: string[]; // IMEIs that failed validation
}
