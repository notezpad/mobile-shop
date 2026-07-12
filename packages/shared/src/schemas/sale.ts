import { z } from 'zod';
import { uuidSchema } from './common';

export const paymentMethodKeySchema = z.enum([
  'cash',
  'card',
  'vodafone_cash',
  'instapay',
  'fawry',
  'credit',
  'mixed',
]);

/** Single cart item — product + quantity (or device_unit_id for IMEI). */
export const cartItemSchema = z.object({
  productId: uuidSchema,
  deviceUnitId: uuidSchema.nullable().optional(), // for IMEI products
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0), // allows manual price override
  discount: z.coerce.number().min(0).default(0),
  discountType: z.enum(['amount', 'percent']).default('amount'),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

/** Single payment entry — supports split payments. */
export const paymentEntrySchema = z.object({
  method: paymentMethodKeySchema,
  amount: z.coerce.number().positive(),
  reference: z.string().max(200).nullable().optional(), // txn ref for digital payments
});

export type PaymentEntryInput = z.infer<typeof paymentEntrySchema>;

/** Create sale — the main POS checkout payload. */
export const createSaleSchema = z.object({
  branchId: uuidSchema,
  customerId: uuidSchema.nullable().optional(),
  cashierId: uuidSchema, // injected from JWT in worker
  items: z.array(cartItemSchema).min(1, 'السلة فارغة'),
  payments: z.array(paymentEntrySchema).min(1, 'أدخل طريقة دفع واحدة على الأقل'),
  discount: z.coerce.number().min(0).default(0),
  discountType: z.enum(['amount', 'percent']).default('amount'),
  notes: z.string().max(1000).nullable().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const saleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(), // invoice_no or customer name
  branchId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  cashierId: uuidSchema.optional(),
  status: z.enum(['draft', 'completed', 'voided', 'refunded']).optional(),
  paymentMethod: paymentMethodKeySchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'total', 'invoiceNo']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type SaleQuery = z.infer<typeof saleQuerySchema>;

/** Void a sale — reverses stock + customer balance. */
export const voidSaleSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

/** Sale with computed totals — response shape. */
export interface SaleWithDetails {
  id: string;
  invoice_no: string;
  branch_id: string;
  customer_id: string | null;
  cashier_id: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  payment_method: string;
  due_amount: number;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  items: Array<{
    id: string;
    product_id: string;
    device_unit_id: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate: number;
    total: number;
    product_name?: string;
    product_sku?: string;
    imei1?: string | null;
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    reference: string | null;
    paid_at: string;
  }>;
  customer_name?: string | null;
  customer_phone?: string | null;
  cashier_name?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  items_count?: number;
}
