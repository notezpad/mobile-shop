import { z } from 'zod';
import { uuidSchema } from './common';

/** Stock level query — list products with their stock for a branch. */
export const stockLevelQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['product', 'quantity', 'value', 'updatedAt']).default('updatedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type StockLevelQuery = z.infer<typeof stockLevelQuerySchema>;

/** Stock movement query — history of all stock changes. */
export const stockMovementQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  type: z
    .enum([
      'purchase',
      'sale',
      'return_in',
      'return_out',
      'transfer_in',
      'transfer_out',
      'adjustment',
      'repair_in',
      'repair_out',
    ])
    .optional(),
  refType: z.string().optional(),
  refId: uuidSchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'quantity']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type StockMovementQuery = z.infer<typeof stockMovementQuerySchema>;

/** Manual stock adjustment (stocktake). */
export const stockAdjustmentSchema = z.object({
  productId: uuidSchema,
  branchId: uuidSchema,
  /** New counted quantity — the system computes the diff. */
  countedQuantity: z.coerce.number().min(0),
  reason: z.string().max(500).optional(),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

/** Batch stocktake — multiple products at once. */
export const batchStockAdjustmentSchema = z.object({
  branchId: uuidSchema,
  adjustments: z.array(stockAdjustmentSchema).min(1).max(200),
  notes: z.string().max(1000).optional(),
});

export type BatchStockAdjustmentInput = z.infer<typeof batchStockAdjustmentSchema>;

/** Stock transfer between branches. */
export const createStockTransferSchema = z.object({
  fromBranchId: uuidSchema,
  toBranchId: uuidSchema,
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1, 'أضف منتجاً واحداً على الأقل')
    .max(100),
  notes: z.string().max(1000).optional(),
});

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;

/** Receive a transfer (partial or full). */
export const receiveStockTransferSchema = z.object({
  /** Per-item received quantities. If omitted, full quantity assumed. */
  receivedItems: z
    .array(
      z.object({
        itemId: uuidSchema,
        receivedQuantity: z.coerce.number().min(0),
      }),
    )
    .optional(),
  notes: z.string().max(1000).optional(),
});

export type ReceiveStockTransferInput = z.infer<typeof receiveStockTransferSchema>;

export const stockTransferQuerySchema = z.object({
  fromBranchId: uuidSchema.optional(),
  toBranchId: uuidSchema.optional(),
  status: z.enum(['draft', 'in_transit', 'received', 'canceled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'shippedAt', 'receivedAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type StockTransferQuery = z.infer<typeof stockTransferQuerySchema>;
