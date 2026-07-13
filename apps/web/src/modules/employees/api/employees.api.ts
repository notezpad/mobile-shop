/**
 * Employees API + hooks.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@core/db/api-client';
import type {
  Employee, Shift, Attendance, PaginatedResult,
  CreateEmployeeInput, UpdateEmployeeInput, EmployeeQuery,
  CreateShiftInput, UpdateShiftInput,
  CheckInInput, CheckOutInput, AttendanceQuery,
  EmployeeWithDetails,
} from '@mobile-shop/shared';

export const employeesApi = {
  list: (q: EmployeeQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sortBy: q.sortBy, sortDir: q.sortDir });
    if (q.search) p.set('search', q.search);
    if (q.branchId) p.set('branchId', q.branchId);
    if (q.status) p.set('status', q.status);
    return api.get<PaginatedResult<EmployeeWithDetails>>(`/employees?${p}`);
  },
  get: (id: string) => api.get<EmployeeWithDetails>(`/employees/${id}`),
  create: (input: CreateEmployeeInput) => api.post<Employee>(`/employees`, input),
  update: (id: string, input: UpdateEmployeeInput) => api.patch<Employee>(`/employees/${id}`, input),
  delete: (id: string) => api.delete<null>(`/employees/${id}`),
};

export const shiftsApi = {
  list: () => api.get<Shift[]>(`/shifts`),
  create: (input: CreateShiftInput) => api.post<Shift>(`/shifts`, input),
  update: (id: string, input: UpdateShiftInput) => api.patch<Shift>(`/shifts/${id}`, input),
};

export const attendanceApi = {
  list: (q: AttendanceQuery) => {
    const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), sortBy: q.sortBy, sortDir: q.sortDir });
    if (q.branchId) p.set('branchId', q.branchId);
    if (q.employeeId) p.set('employeeId', q.employeeId);
    if (q.date) p.set('date', q.date);
    if (q.status) p.set('status', q.status);
    if (q.fromDate) p.set('fromDate', q.fromDate);
    if (q.toDate) p.set('toDate', q.toDate);
    return api.get<PaginatedResult<Attendance & { employee_name?: string; employee_code?: string; branch_name?: string }>>(`/attendance?${p}`);
  },
  checkIn: (input: CheckInInput) => api.post<Attendance>(`/attendance/check-in`, input),
  checkOut: (input: CheckOutInput) => api.post<Attendance>(`/attendance/check-out`, input),
};

export function useEmployees(query: EmployeeQuery) {
  return useQuery({ queryKey: ['employees', query], queryFn: () => employeesApi.list(query), placeholderData: (prev) => prev, staleTime: 30_000 });
}
export function useEmployee(id?: string | null) {
  return useQuery({ queryKey: ['employee', id], queryFn: () => employeesApi.get(id!), enabled: !!id });
}
export function useShifts() {
  return useQuery({ queryKey: ['shifts'], queryFn: shiftsApi.list, staleTime: 5 * 60_000 });
}
export function useAttendance(query: AttendanceQuery) {
  return useQuery({ queryKey: ['attendance', query], queryFn: () => attendanceApi.list(query), placeholderData: (prev) => prev });
}
