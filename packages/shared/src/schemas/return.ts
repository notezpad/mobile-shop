import { z } from 'zod';
import { uuidSchema } from './common';

export const returnStatusSchema = z.enum(['pending', 'approved', 'rejected', 'completed']);

export const refundMethodSchema = z.enum([
  'cash',
  'card',
  'vodafone_cash',
  'instapay',
  'fawry',
  'credit',
  'store_credit',
]);

/** Single return item — references a sale_item. */
export const returnItemSchema = z.object({
  saleItemId: uuidSchema,
  quantity: z.coerce.number().positive(),
  refundAmount: z.coerce.number().min(0),
});

export type ReturnItemInput = z.infer<typeof returnItemSchema>;

/** Create return — customer returning items from a sale. */
export const createReturnSchema = z.object({
  saleId: uuidSchema,
  branchId: uuidSchema,
  customerId: uuidSchema.nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  items: z.array(returnItemSchema).min(1, 'أضف صنف مرتجع واحد على الأقل'),
  refundMethod: refundMethodSchema.default('cash'),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const updateReturnSchema = z.object({
  status: returnStatusSchema.optional(),
  reason: z.string().max(500).nullable().optional(),
  refundMethod: refundMethodSchema.optional(),
  approvedBy: uuidSchema.optional(),
}).partial();

export type UpdateReturnInput = z.infer<typeof updateReturnSchema>;

export const returnQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  branchId: uuidSchema.optional(),
  saleId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  status: returnStatusSchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'total']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ReturnQuery = z.infer<typeof returnQuerySchema>;

/** Return with joined names + items — response shape. */
export interface ReturnWithDetails {
  id: string;
  return_no: string;
  sale_id: string;
  branch_id: string;
  customer_id: string | null;
  reason: string | null;
  total: number;
  status: string;
  refund_method: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: string;
    return_id: string;
    sale_item_id: string;
    quantity: number;
    refund_amount: number;
    product_name?: string;
    product_sku?: string;
    imei1?: string | null;
  }>;
  customer_name?: string | null;
  customer_phone?: string | null;
  branch_name?: string | null;
  sale_invoice_no?: string | null;
  approved_by_name?: string | null;
}
