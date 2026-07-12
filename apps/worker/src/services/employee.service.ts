/**
 * Employee + Shift + Attendance services.
 */
import {
  AppError, ERROR_CODES,
  type Employee, type Shift, type Attendance,
  type PaginatedResult,
  type CreateEmployeeInput, type UpdateEmployeeInput, type EmployeeQuery,
  type CreateShiftInput, type UpdateShiftInput,
  type CheckInInput, type CheckOutInput, type AttendanceQuery,
  type EmployeeWithDetails,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const EMP_TABLE = 'employees';
const SHIFT_TABLE = 'shifts';
const ATT_TABLE = 'attendance';

// ─── EMPLOYEES ────────────────────────────────────────────────────

export async function listEmployees(
  supabase: LooseSupabaseClient,
  query: EmployeeQuery,
): Promise<PaginatedResult<EmployeeWithDetails>> {
  let q = supabase
    .from('v_employees_summary')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`full_name.ilike.%${query.search}%,code.ilike.%${query.search}%,phone.ilike.%${query.search}%`);
  }
  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.status) q = q.eq('status', query.status);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'fullName': return 'full_name';
      case 'code': return 'code';
      case 'hireDate': return 'hire_date';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as unknown as EmployeeWithDetails[],
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

export async function getEmployee(supabase: LooseSupabaseClient, id: string): Promise<EmployeeWithDetails> {
  const { data, error } = await supabase
    .from('v_employees_summary')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'الموظف غير موجود');
  return data as unknown as EmployeeWithDetails;
}

export async function createEmployee(
  supabase: LooseSupabaseClient,
  input: CreateEmployeeInput,
  actor: AccessTokenUser,
): Promise<Employee> {
  // Check unique code.
  const { data: existing } = await supabase
    .from(EMP_TABLE).select('id').eq('code', input.code).is('deleted_at', null).maybeSingle();
  if (existing) throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'كود الموظف مستخدم بالفعل');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: emp, error } = await supabase.from(EMP_TABLE).insert({
    id, user_id: input.userId ?? null, branch_id: input.branchId, code: input.code,
    full_name: input.fullName, national_id: input.nationalId ?? null, phone: input.phone ?? null,
    address: input.address ?? null, hire_date: input.hireDate, termination_date: null,
    status: input.status, position: input.position ?? null, base_salary: input.baseSalary,
    allowances: input.allowances, shift_id: input.shiftId ?? null, photo_url: input.photoUrl ?? null,
    created_at: now, updated_at: now, deleted_at: null, revision: 1, sync_status: 'synced',
    created_by: actor.id, updated_by: actor.id,
  }).select('*').single();

  if (error) {
    if (error.code === '23505') throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'الكود مستخدم بالفعل');
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id, action: 'create', entity: EMP_TABLE, entityId: id,
    after: { code: input.code, fullName: input.fullName },
  });

  return emp as Employee;
}

export async function updateEmployee(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateEmployeeInput,
  actor: AccessTokenUser,
): Promise<Employee> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actor.id };
  if (input.userId !== undefined) updates.user_id = input.userId;
  if (input.branchId !== undefined) updates.branch_id = input.branchId;
  if (input.code !== undefined) updates.code = input.code;
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.nationalId !== undefined) updates.national_id = input.nationalId;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.address !== undefined) updates.address = input.address;
  if (input.hireDate !== undefined) updates.hire_date = input.hireDate;
  if (input.position !== undefined) updates.position = input.position;
  if (input.baseSalary !== undefined) updates.base_salary = input.baseSalary;
  if (input.allowances !== undefined) updates.allowances = input.allowances;
  if (input.shiftId !== undefined) updates.shift_id = input.shiftId;
  if (input.photoUrl !== undefined) updates.photo_url = input.photoUrl;
  if (input.status !== undefined) updates.status = input.status;

  const { data, error } = await supabase.from(EMP_TABLE).update(updates).eq('id', id).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as Employee;
}

export async function deleteEmployee(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from(EMP_TABLE)
    .update({ deleted_at: now, status: 'terminated', termination_date: now, updated_at: now, updated_by: actor.id })
    .eq('id', id);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
}

// ─── SHIFTS ───────────────────────────────────────────────────────

export async function listShifts(supabase: LooseSupabaseClient): Promise<Shift[]> {
  const { data, error } = await supabase.from(SHIFT_TABLE).select('*').is('deleted_at', null).order('name', { ascending: true });
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as Shift[];
}

export async function createShift(
  supabase: LooseSupabaseClient,
  input: CreateShiftInput,
  actor: AccessTokenUser,
): Promise<Shift> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from(SHIFT_TABLE).insert({
    id, name: input.name, start_time: input.startTime, end_time: input.endTime,
    grace_minutes: input.graceMinutes, is_active: input.isActive,
    created_at: now, updated_at: now, deleted_at: null, revision: 1, sync_status: 'synced',
  }).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as Shift;
}

export async function updateShift(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateShiftInput,
  actor: AccessTokenUser,
): Promise<Shift> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.startTime !== undefined) updates.start_time = input.startTime;
  if (input.endTime !== undefined) updates.end_time = input.endTime;
  if (input.graceMinutes !== undefined) updates.grace_minutes = input.graceMinutes;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  const { data, error } = await supabase.from(SHIFT_TABLE).update(updates).eq('id', id).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as Shift;
}

// ─── ATTENDANCE ───────────────────────────────────────────────────

export async function listAttendance(
  supabase: LooseSupabaseClient,
  query: AttendanceQuery,
): Promise<PaginatedResult<Attendance & { employee_name?: string; branch_name?: string }>> {
  let q = supabase
    .from('v_attendance_list')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.employeeId) q = q.eq('employee_id', query.employeeId);
  if (query.date) q = q.eq('date', query.date);
  if (query.status) q = q.eq('status', query.status);
  if (query.fromDate) q = q.gte('date', query.fromDate);
  if (query.toDate) q = q.lte('date', query.toDate);

  const sortColumn = query.sortBy === 'createdAt' ? 'created_at' : 'date';
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });

  const offset = (query.page - 1) * query.pageSize;
  q = q.range(offset, offset + query.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return {
    items: (data ?? []) as Array<Attendance & { employee_name?: string; branch_name?: string }>,
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil((count ?? 0) / query.pageSize) || 1,
  };
}

export async function checkIn(
  supabase: LooseSupabaseClient,
  input: CheckInInput,
  actor: AccessTokenUser,
): Promise<Attendance> {
  const today = new Date().toISOString().split('T')[0]!;
  // Check no existing check-in for today.
  const { data: existing } = await supabase
    .from(ATT_TABLE).select('id')
    .eq('employee_id', input.employeeId).eq('date', today).is('deleted_at', null).maybeSingle();
  if (existing) throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'تم تسجيل الحضور اليوم بالفعل');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  // Determine status: late if after shift start + grace.
  let status: string = 'present';
  const { data: emp } = await supabase
    .from(EMP_TABLE).select('shift:shifts(start_time, grace_minutes)').eq('id', input.employeeId).maybeSingle();
  const shiftData = (emp as { shift?: { start_time: string; grace_minutes: number } | null } | null)?.shift;
  if (shiftData) {
    const currentTime = new Date().toTimeString().slice(0, 5);
    const [sh, sm] = shiftData.start_time.split(':').map(Number);
    const graceMs = shiftData.grace_minutes * 60 * 1000;
    const shiftStart = new Date();
    shiftStart.setHours(sh ?? 0, sm ?? 0, 0, 0);
    if (new Date().getTime() > shiftStart.getTime() + graceMs) {
      status = 'late';
    }
  }

  const { data: att, error } = await supabase.from(ATT_TABLE).insert({
    id, employee_id: input.employeeId, branch_id: input.branchId,
    date: today, check_in: now, check_out: null, status,
    notes: null, created_at: now, updated_at: now, deleted_at: null, revision: 1, sync_status: 'synced',
  }).select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return att as Attendance;
}

export async function checkOut(
  supabase: LooseSupabaseClient,
  input: CheckOutInput,
  actor: AccessTokenUser,
): Promise<Attendance> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(ATT_TABLE)
    .update({ check_out: now, notes: input.notes ?? null, updated_at: now })
    .eq('id', input.attendanceId)
    .select('*').single();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return data as Attendance;
}
