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

/** Record a customer payment (installment / settlement on running balance). */
export const recordCustomerPaymentSchema = z.object({
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
  paymentMethod: z.enum([
    'cash',
    'card',
    'vodafone_cash',
    'instapay',
    'fawry',
  ]).default('cash'),
  reference: z.string().max(200).nullable().optional(),
  paidAt: z.string().datetime().optional(), // defaults to now() server-side
  notes: z.string().max(1000).nullable().optional(),
});

export type RecordCustomerPaymentInput = z.infer<typeof recordCustomerPaymentSchema>;

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

/** Customer transaction entry — derived from sales, repairs, returns, payments, adjustments. */
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

/** Customer payment record (one row per installment / settlement). */
export interface CustomerPayment {
  id: string;
  customer_id: string;
  branch_id: string;
  user_id: string;
  cashbox_id: string | null;
  amount: number;
  payment_method: string;
  reference: string | null;
  paid_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
