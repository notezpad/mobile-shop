import { z } from 'zod';
import { nonEmptyString, uuidSchema, imeiSchema } from './common';

export const repairStatusSchema = z.enum([
  'received',
  'diagnosing',
  'waiting_parts',
  'repairing',
  'ready',
  'delivered',
  'canceled',
  'warranty_return',
]);

// Note: RepairStatus type is defined in types/repairs.ts (shared with types module).

/** Create a new repair ticket. */
export const createRepairSchema = z.object({
  branchId: uuidSchema,
  customerId: uuidSchema,
  technicianId: uuidSchema.nullable().optional(),
  deviceBrand: nonEmptyString.min(1).max(100),
  deviceModel: nonEmptyString.min(1).max(100),
  deviceImei: imeiSchema.nullable().optional(),
  devicePassword: z.string().max(100).nullable().optional(),
  problemDescription: nonEmptyString.min(1).max(2000),
  customerNotes: z.string().max(1000).nullable().optional(),
  accessories: z.array(z.string().max(100)).default([]),
  inspectionPhotos: z.array(z.string()).max(4).default([]), // base64 data URLs
  estimatedDeliveryAt: z.string().datetime().nullable().optional(),
  laborCost: z.coerce.number().min(0).default(0),
  partsCost: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  paid: z.coerce.number().min(0).default(0),
  warrantyDays: z.coerce.number().int().min(0).default(0),
  notes: z.string().max(1000).nullable().optional(),
});

export type CreateRepairInput = z.infer<typeof createRepairSchema>;

/** Update repair — status change, costs, assignment. */
export const updateRepairSchema = z.object({
  technicianId: uuidSchema.nullable().optional(),
  status: repairStatusSchema.optional(),
  problemDescription: z.string().max(2000).optional(),
  customerNotes: z.string().max(1000).nullable().optional(),
  estimatedDeliveryAt: z.string().datetime().nullable().optional(),
  laborCost: z.coerce.number().min(0).optional(),
  partsCost: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).optional(),
  paid: z.coerce.number().min(0).optional(),
  warrantyDays: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type UpdateRepairInput = z.infer<typeof updateRepairSchema>;

/** Change status with optional note. */
export const changeRepairStatusSchema = z.object({
  status: repairStatusSchema,
  note: z.string().max(500).nullable().optional(),
});

export type ChangeRepairStatusInput = z.infer<typeof changeRepairStatusSchema>;

/** Add a repair part (consumes from inventory). */
export const addRepairPartSchema = z.object({
  productId: uuidSchema,
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0).default(0),
});

export type AddRepairPartInput = z.infer<typeof addRepairPartSchema>;

/** Deliver a repair — mark as delivered + collect payment. */
export const deliverRepairSchema = z.object({
  paid: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).nullable().optional(),
});

export type DeliverRepairInput = z.infer<typeof deliverRepairSchema>;

export const repairQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  branchId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  technicianId: uuidSchema.optional(),
  status: repairStatusSchema.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['createdAt', 'ticketNo', 'total', 'status']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type RepairQuery = z.infer<typeof repairQuerySchema>;

/** Repair with joined names + history + parts — response shape. */
export interface RepairWithDetails {
  id: string;
  ticket_no: string;
  branch_id: string;
  customer_id: string;
  technician_id: string | null;
  received_by: string;
  device_brand: string;
  device_model: string;
  device_imei: string | null;
  device_password: string | null;
  problem_description: string;
  customer_notes: string | null;
  accessories: string[];
  inspection_photos: string[];
  status: string;
  received_at: string;
  estimated_delivery_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  delivered_at: string | null;
  labor_cost: number;
  parts_cost: number;
  discount: number;
  total: number;
  paid: number;
  due_amount: number;
  warranty_days: number;
  parent_repair_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined names
  customer_name?: string | null;
  customer_phone?: string | null;
  technician_name?: string | null;
  received_by_name?: string | null;
  branch_name?: string | null;
  // Related data
  history?: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    user_id: string;
    user_name?: string | null;
    created_at: string;
  }>;
  parts?: Array<{
    id: string;
    repair_id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    total: number;
    stock_movement_id: string | null;
    product_name?: string | null;
    product_sku?: string | null;
  }>;
}

/** Public tracking info — no sensitive data. */
export interface RepairTrackingInfo {
  ticket_no: string;
  status: string;
  device_brand: string;
  device_model: string;
  received_at: string;
  estimated_delivery_at: string | null;
  completed_at: string | null;
  delivered_at: string | null;
  total: number;
  paid: number;
  due_amount: number;
  warranty_days: number;
  customer_name: string | null;
  history: Array<{
    to_status: string;
    note: string | null;
    created_at: string;
  }>;
}
