import type { BaseEntity, UUID } from './base';

/** Role keys. System roles are seeded and cannot be deleted. */
export type RoleKey =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'technician'
  | 'accountant';

/** User status in the system. */
export type UserStatus = 'active' | 'suspended' | 'invited';

export interface Role extends BaseEntity {
  key: RoleKey;
  name: string;
  description: string | null;
  /** Whether this is a system-seeded role (cannot be deleted). */
  is_system: boolean;
}

export interface Permission extends BaseEntity {
  /** Format: `<module>.<action>` e.g. `sales.create`, `reports.view`. */
  key: string;
  module: string;
  action: string;
  description: string | null;
}

export interface RolePermission extends BaseEntity {
  role_id: UUID;
  permission_id: UUID;
}

export interface User extends BaseEntity {
  username: string;
  /** PBKDF2 hash — never plain text. */
  password_hash: string | null;
  /** Optional 4–6 digit PIN hash for fast offline unlock. */
  pin_hash: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role_id: UUID;
  /** Primary branch — determines default scope for queries. */
  branch_id: UUID | null;
  status: UserStatus;
  last_login_at: string | null;
  /** Preferences (UI theme, language, etc.). Stored as JSONB in DB. */
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'ar' | 'en';
  sidebarCollapsed: boolean;
  defaultBranchId?: UUID;
}

/** Audit log entry — written for every state-changing operation. */
export interface AuditLog extends BaseEntity {
  user_id: UUID | null;
  action: 'create' | 'update' | 'delete' | 'restore' | 'login' | 'logout' | 'export' | 'print';
  entity: string;
  entity_id: UUID | null;
  /** JSON snapshot before the change. NULL for create. */
  before: Record<string, unknown> | null;
  /** JSON snapshot after the change. NULL for delete. */
  after: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

/** Session payload — what gets stored in JWT. */
export interface SessionPayload {
  sub: UUID;
  username: string;
  role_key: RoleKey;
  role_id: UUID;
  branch_id: UUID | null;
  permissions: string[];
  exp: number;
  iat: number;
}
