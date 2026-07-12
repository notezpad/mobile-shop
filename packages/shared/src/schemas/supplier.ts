import { z } from 'zod';
import { nonEmptyString, phoneSchema } from './common';

export const createSupplierSchema = z.object({
  name: nonEmptyString.min(2).max(200),
  code: nonEmptyString.min(2).max(50),
  phone: phoneSchema,
  email: z.string().email().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const adjustSupplierBalanceSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, 'المبلغ يجب ألا يكون صفر'),
  reason: nonEmptyString.min(1).max(500),
});

export type AdjustSupplierBalanceInput = z.infer<typeof adjustSupplierBalanceSchema>;

export const supplierQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  hasBalance: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['name', 'code', 'balance', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type SupplierQuery = z.infer<typeof supplierQuerySchema>;
