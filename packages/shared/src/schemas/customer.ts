import { z } from 'zod';
import { nonEmptyString, phoneSchema, uuidSchema } from './common';

export const createCustomerSchema = z.object({
  name: nonEmptyString.min(2).max(200),
  code: z.string().max(50).nullable().optional(),
  phone: phoneSchema,
  email: z.string().email().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  creditLimit: z.coerce.number().min(0).default(0),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** Adjust customer balance (manual credit/debit). */
export const adjustCustomerBalanceSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, 'المبلغ يجب ألا يكون صفر'),
  reason: nonEmptyString.min(1).max(500),
  branchId: uuidSchema.optional(),
});

export type AdjustCustomerBalanceInput = z.infer<typeof adjustCustomerBalanceSchema>;

export const customerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  hasBalance: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['name', 'code', 'phone', 'balance', 'totalPurchases', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CustomerQuery = z.infer<typeof customerQuerySchema>;

/** Customer transaction entry — derived from sales, repairs, returns, manual adjustments. */
export interface CustomerTransaction {
  id: string;
  customer_id: string;
  type: 'sale' | 'return' | 'repair' | 'payment' | 'adjustment';
  ref_type: string;
  ref_id: string | null;
  description: string;
  amount: number; // positive = customer owes, negative = customer paid/credited
  balance_after: number;
  created_at: string;
  ref_number?: string | null;
}
