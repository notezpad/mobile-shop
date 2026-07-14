import { z } from 'zod';
import { nonEmptyString, uuidSchema, imeiSchema } from './common';

export const productTypeSchema = z.enum(['standard', 'imei', 'service']);

export const createProductSchema = z.object({
  sku: nonEmptyString.min(1).max(50),
  barcode: z.string().max(100).nullable().optional(),
  name: nonEmptyString.min(1).max(200),
  nameAr: z.string().max(200).nullable().optional(),
  categoryId: uuidSchema.nullable().optional(),
  branchId: uuidSchema.nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  type: productTypeSchema.default('standard'),
  unit: z.string().max(20).default('piece'),
  costPrice: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
  wholesalePrice: z.coerce.number().min(0).nullable().optional(),
  taxRate: z.coerce.number().min(0).max(100).default(14),
  minQuantity: z.coerce.number().int().min(0).default(0),
  hasWarranty: z.boolean().default(false),
  warrantyDays: z.coerce.number().int().min(0).default(0),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().default(true),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  categoryId: uuidSchema.optional(),
  type: productTypeSchema.optional(),
  isActive: z.enum(['true', 'false']).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  sortBy: z
    .enum(['name', 'sku', 'salePrice', 'createdAt', 'stockLevel'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;
