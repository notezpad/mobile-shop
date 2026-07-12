import type { BaseEntity, UUID } from './base';

export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

export interface Employee extends BaseEntity {
  user_id: UUID | null;
  branch_id: UUID;
  code: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  address: string | null;
  hire_date: string;
  termination_date: string | null;
  status: EmployeeStatus;
  position: string | null;
  base_salary: number;
  allowances: number;
  shift_id: UUID | null;
  photo_url: string | null;
}

export interface Shift extends BaseEntity {
  name: string;
  start_time: string; // "09:00"
  end_time: string; // "17:00"
  grace_minutes: number;
  is_active: boolean;
}

export interface Attendance extends BaseEntity {
  employee_id: UUID;
  branch_id: UUID;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'absent' | 'late' | 'leave' | 'holiday';
  notes: string | null;
}
