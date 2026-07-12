import { z } from 'zod';
import { uuidSchema, nonEmptyString } from './common';
import { paymentMethodKeySchema } from './sale';

// ─── Cashbox ──────────────────────────────────────────────────────

export const openCashboxSchema = z.object({
  branchId: uuidSchema,
  openingBalance: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
});

export type OpenCashboxInput = z.infer<typeof openCashboxSchema>;

export const closeCashboxSchema = z.object({
  closingBalance: z.coerce.number().min(0),
  notes: z.string().max(500).nullable().optional(),
});

export type CloseCashboxInput = z.infer<typeof closeCashboxSchema>;

export const cashboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  status: z.enum(['open', 'closed', 'forced_closed']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['openedAt', 'closedAt']).default('openedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CashboxQuery = z.infer<typeof cashboxQuerySchema>;

// ─── Expenses ─────────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  branchId: uuidSchema,
  categoryId: uuidSchema,
  amount: z.coerce.number().positive('المبلغ يجب أن يكون موجب'),
  paymentMethod: paymentMethodKeySchema,
  date: z.string(),
  note: z.string().max(500).nullable().optional(),
  cashboxId: uuidSchema.nullable().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial();
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const expenseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  paymentMethod: paymentMethodKeySchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'amount', 'createdAt']).default('date'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;

export const createExpenseCategorySchema = z.object({
  name: nonEmptyString.min(1).max(100),
  icon: z.string().max(50).nullable().optional(),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

// ─── Revenues ─────────────────────────────────────────────────────

export const createRevenueSchema = z.object({
  branchId: uuidSchema,
  categoryId: uuidSchema,
  amount: z.coerce.number().positive('المبلغ يجب أن يكون موجب'),
  paymentMethod: paymentMethodKeySchema,
  date: z.string(),
  note: z.string().max(500).nullable().optional(),
  cashboxId: uuidSchema.nullable().optional(),
});

export type CreateRevenueInput = z.infer<typeof createRevenueSchema>;

export const updateRevenueSchema = createRevenueSchema.partial();
export type UpdateRevenueInput = z.infer<typeof updateRevenueSchema>;

export const revenueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  branchId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  paymentMethod: paymentMethodKeySchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'amount', 'createdAt']).default('date'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type RevenueQuery = z.infer<typeof revenueQuerySchema>;

export const createRevenueCategorySchema = z.object({
  name: nonEmptyString.min(1).max(100),
  icon: z.string().max(50).nullable().optional(),
});

export type CreateRevenueCategoryInput = z.infer<typeof createRevenueCategorySchema>;

// ─── Payment Methods ──────────────────────────────────────────────

export const updatePaymentMethodSchema = z.object({
  name: z.string().max(100).optional(),
  nameAr: z.string().max(100).optional(),
  icon: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;
