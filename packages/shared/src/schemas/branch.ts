import { z } from 'zod';
import { nonEmptyString, phoneSchema, uuidSchema } from './common';

/**
 * Branch settings — per-branch overrides for tax, currency, receipt, etc.
 *
 * Note: The TypeScript `BranchSettings` interface is defined separately in
 * `types/catalog.ts`. This Zod schema is the runtime validator that mirrors
 * its shape exactly.
 */
export const branchSettingsSchema = z.object({
  taxRate: z.number().min(0).max(100),
  currency: z.string().min(2).max(5),
  receiptHeader: z.string().max(500).nullable(),
  receiptFooter: z.string().max(500).nullable(),
  lowStockThreshold: z.number().int().min(0),
  enableVatInvoice: z.boolean(),
  vatNumber: z.string().max(50).nullable(),
  // Receipt printer settings (Phase 7 — placeholders for now)
  printerType: z.enum(['thermal_80', 'thermal_58', 'a4', 'none']),
  printerName: z.string().max(100).nullable(),
});

/** Default branch settings applied when none are provided. */
export const DEFAULT_BRANCH_SETTINGS = {
  taxRate: 14,
  currency: 'EGP',
  receiptHeader: null as string | null,
  receiptFooter: null as string | null,
  lowStockThreshold: 5,
  enableVatInvoice: true,
  vatNumber: null as string | null,
  printerType: 'a4' as const,
  printerName: null as string | null,
};

export const createBranchSchema = z.object({
  name: nonEmptyString.min(2).max(100),
  code: nonEmptyString.min(2).max(20).regex(/^[A-Z0-9-]+$/i, 'أحرف إنجليزية وأرقام فقط'),
  address: z.string().max(500).nullable().optional(),
  phone: phoneSchema,
  email: z.string().email().nullable().optional(),
  isMain: z.boolean().default(false),
  isActive: z.boolean().default(true),
  settings: branchSettingsSchema.partial().optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const branchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['name', 'code', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type BranchQuery = z.infer<typeof branchQuerySchema>;

void uuidSchema; // tree-shake safety
