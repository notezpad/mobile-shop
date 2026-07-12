import { z } from 'zod';
import { nonEmptyString, uuidSchema } from './common';

export const createCategorySchema = z.object({
  name: nonEmptyString.min(1).max(100),
  parentId: uuidSchema.nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryQuerySchema = z.object({
  parentId: uuidSchema.optional(), // filter by parent (or 'null' for roots)
  includeInactive: z.coerce.boolean().default(false),
});

export type CategoryQuery = z.infer<typeof categoryQuerySchema>;
