import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApiResponse, type PaginatedResult, type Employee, type Shift, type Attendance,
  type EmployeeWithDetails,
  createEmployeeSchema, updateEmployeeSchema, employeeQuerySchema,
  createShiftSchema, updateShiftSchema,
  checkInSchema, checkOutSchema, attendanceQuerySchema,
} from '@mobile-shop/shared';
import type { AppContext } from '../types/env';
import { authMiddleware, getReqSupabase, requireUser } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import {
  listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
  listShifts, createShift, updateShift,
  listAttendance, checkIn, checkOut,
} from '../services/employee.service';

// ─── Employee routes ──────────────────────────────────────────────

export const employeeRoutes = new Hono<AppContext>();
employeeRoutes.use('*', authMiddleware);

employeeRoutes.get('/', requirePermission('employees.view'),
  zValidator('query', employeeQuerySchema),
  async (c) => {
    const supabase = getReqSupabase(c);
    const result = await listEmployees(supabase, c.req.valid('query'));
    const response: ApiResponse<PaginatedResult<EmployeeWithDetails>> = {
      success: true, data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

employeeRoutes.get('/:id', requirePermission('employees.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const emp = await getEmployee(supabase, c.req.param('id'));
  const response: ApiResponse<EmployeeWithDetails> = { success: true, data: emp };
  return c.json(response, 200);
});

employeeRoutes.post('/', requirePermission('employees.create'),
  zValidator('json', createEmployeeSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const emp = await createEmployee(supabase, input, actor);
    const response: ApiResponse<Employee> = { success: true, data: emp };
    return c.json(response, 201);
  },
);

employeeRoutes.patch('/:id', requirePermission('employees.edit'),
  zValidator('json', updateEmployeeSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const emp = await updateEmployee(supabase, c.req.param('id'), input, actor);
    const response: ApiResponse<Employee> = { success: true, data: emp };
    return c.json(response, 200);
  },
);

employeeRoutes.delete('/:id', requirePermission('employees.delete'), async (c) => {
  const actor = requireUser(c);
  const supabase = getReqSupabase(c);
  await deleteEmployee(supabase, c.req.param('id'), actor);
  const response: ApiResponse<null> = { success: true, data: null };
  return c.json(response, 200);
});

// ─── Shift routes ─────────────────────────────────────────────────

export const shiftRoutes = new Hono<AppContext>();
shiftRoutes.use('*', authMiddleware);

shiftRoutes.get('/', requirePermission('employees.view'), async (c) => {
  const supabase = getReqSupabase(c);
  const shifts = await listShifts(supabase);
  const response: ApiResponse<Shift[]> = { success: true, data: shifts };
  return c.json(response, 200);
});

shiftRoutes.post('/', requirePermission('employees.create'),
  zValidator('json', createShiftSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const shift = await createShift(supabase, input, actor);
    const response: ApiResponse<Shift> = { success: true, data: shift };
    return c.json(response, 201);
  },
);

shiftRoutes.patch('/:id', requirePermission('employees.edit'),
  zValidator('json', updateShiftSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const shift = await updateShift(supabase, c.req.param('id'), input, actor);
    const response: ApiResponse<Shift> = { success: true, data: shift };
    return c.json(response, 200);
  },
);

// ─── Attendance routes ────────────────────────────────────────────

export const attendanceRoutes = new Hono<AppContext>();
attendanceRoutes.use('*', authMiddleware);

attendanceRoutes.get('/', requirePermission('employees.view'),
  zValidator('query', attendanceQuerySchema),
  async (c) => {
    const supabase = getReqSupabase(c);
    const result = await listAttendance(supabase, c.req.valid('query'));
    const response: ApiResponse<typeof result> = {
      success: true, data: result,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    };
    return c.json(response, 200);
  },
);

attendanceRoutes.post('/check-in', requirePermission('employees.view'),
  zValidator('json', checkInSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const att = await checkIn(supabase, input, actor);
    const response: ApiResponse<Attendance> = { success: true, data: att };
    return c.json(response, 201);
  },
);

attendanceRoutes.post('/check-out', requirePermission('employees.view'),
  zValidator('json', checkOutSchema),
  async (c) => {
    const input = c.req.valid('json');
    const actor = requireUser(c);
    const supabase = getReqSupabase(c);
    const att = await checkOut(supabase, input, actor);
    const response: ApiResponse<Attendance> = { success: true, data: att };
    return c.json(response, 200);
  },
);
