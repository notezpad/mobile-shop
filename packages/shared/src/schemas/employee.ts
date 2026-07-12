import { z } from 'zod';
import { uuidSchema, nonEmptyString, phoneSchema, nationalIdSchema } from './common';

// ─── Employees ────────────────────────────────────────────────────

export const employeeStatusSchema = z.enum(['active', 'on_leave', 'terminated']);

export const createEmployeeSchema = z.object({
  userId: uuidSchema.nullable().optional(),
  branchId: uuidSchema,
  code: nonEmptyString.min(1).max(50),
  fullName: nonEmptyString.min(2).max(200),
  nationalId: nationalIdSchema,
  phone: phoneSchema,
  address: z.string().max(500).nullable().optional(),
  hireDate: z.string(),
  position: z.string().max(100).nullable().optional(),
  baseSalary: z.coerce.number().min(0).default(0),
  allowances: z.coerce.number().min(0).default(0),
  shiftId: uuidSchema.nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  status: employeeStatusSchema.default('active'),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  branchId: uuidSchema.optional(),
  status: employeeStatusSchema.optional(),
  sortBy: z.enum(['fullName', 'code', 'hireDate', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;

// ─── Shifts ───────────────────────────────────────────────────────

export const createShiftSchema = z.object({
  name: nonEmptyString.min(1).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM format'),
  graceMinutes: z.coerce.number().int().min(0).max(120).default(15),
  isActive: z.boolean().default(true),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateShiftSchema = createShiftSchema.partial();
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

// ─── Attendance ───────────────────────────────────────────────────

export const checkInSchema = z.object({
  employeeId: uuidSchema,
  branchId: uuidSchema,
});

export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = z.object({
  attendanceId: uuidSchema,
  notes: z.string().max(500).nullable().optional(),
});

export type CheckOutInput = z.infer<typeof checkOutSchema>;

export const attendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(31),
  branchId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  date: z.string().optional(),
  status: z.enum(['present', 'absent', 'late', 'leave', 'holiday']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.enum(['date', 'createdAt']).default('date'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;

// ─── Response interfaces ──────────────────────────────────────────

export interface EmployeeWithDetails {
  id: string;
  branch_id: string;
  code: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  address: string | null;
  hire_date: string;
  termination_date: string | null;
  status: string;
  position: string | null;
  base_salary: number;
  allowances: number;
  shift_id: string | null;
  photo_url: string | null;
  user_id: string | null;
  created_at: string;
  // Joined
  branch_name?: string;
  shift_name?: string | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  user_username?: string | null;
  // Performance stats
  sales_count?: number;
  sales_total?: number;
  repairs_count?: number;
  repairs_revenue?: number;
}
