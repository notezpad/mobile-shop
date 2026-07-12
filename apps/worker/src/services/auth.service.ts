/**
 * Auth service — login, refresh, logout, me, change-password.
 *
 * Uses Supabase as the user store (read) and writes audit logs on every event.
 * Passwords/PINs verified using PBKDF2 (Web Crypto).
 * JWTs issued via `jose`.
 */
import {
  AppError,
  ERROR_CODES,
  type RoleKey,
  type User,
  type Role,
  type Permission,
  type SessionResponse,
  type UserPreferences,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { hashSecret, verifySecret } from '../lib/crypto';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../lib/jwt';
import { writeAuditLog, type AuditAction } from './audit.service';

interface LoginResult {
  session: SessionResponse;
  refreshToken: string;
}

/** Login with username + password. */
export async function loginWithPassword(
  supabase: LooseSupabaseClient,
  jwtSecret: string,
  input: { username: string; password: string },
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<LoginResult> {
  // 1. Fetch user by username.
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('username', input.username)
    .is('deleted_at', null)
    .maybeSingle();

  if (userErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, userErr.message);
  if (!user || !user.password_hash) {
    throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'بيانات الدخول غير صحيحة');
  }

  // 2. Check status.
  if (user.status === 'suspended') {
    throw new AppError(ERROR_CODES.AUTH_ACCOUNT_SUSPENDED, 'هذا الحساب موقوف');
  }

  // 3. Verify password.
  const valid = await verifySecret(input.password, user.password_hash);
  if (!valid) {
    throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'بيانات الدخول غير صحيحة');
  }

  // 4. Load role + permissions.
  const { role, permissions } = await loadRoleAndPermissions(supabase, user.role_id);

  // 5. Update last_login_at.
  await supabase
    .from('users')
    .update({
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  // 6. Issue tokens.
  const session = await buildSessionResponse(user, role, permissions);
  const access = await signAccessToken(
    {
      sub: user.id,
      username: user.username,
      roleId: user.role_id,
      roleKey: role.key as RoleKey,
      branchId: user.branch_id,
      tenantId: (user as { tenant_id?: string | null }).tenant_id ?? null,
      permissions: permissions.map((p) => p.key),
    },
    jwtSecret,
  );
  const refresh = await signRefreshToken(user.id, crypto.randomUUID(), jwtSecret);

  // 7. Audit.
  await writeAuditLog(supabase, {
    userId: user.id,
    action: 'login',
    entity: 'users',
    entityId: user.id,
    after: { username: user.username, roleKey: role.key },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    session: { ...session, accessToken: access.token, expiresIn: access.expiresIn },
    refreshToken: refresh.token,
  };
}

/** Refresh access token using a refresh token. */
export async function refreshSession(
  supabase: LooseSupabaseClient,
  jwtSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken, jwtSecret);
  } catch {
    throw new AppError(ERROR_CODES.AUTH_TOKEN_INVALID, 'Refresh token غير صالح');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', payload.sub)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !user) {
    throw new AppError(ERROR_CODES.AUTH_NO_SESSION, 'المستخدم غير موجود');
  }
  if (user.status === 'suspended') {
    throw new AppError(ERROR_CODES.AUTH_ACCOUNT_SUSPENDED, 'الحساب موقوف');
  }

  const { role, permissions } = await loadRoleAndPermissions(supabase, user.role_id);

  const access = await signAccessToken(
    {
      sub: user.id,
      username: user.username,
      roleId: user.role_id,
      roleKey: role.key as RoleKey,
      branchId: user.branch_id,
      tenantId: (user as { tenant_id?: string | null }).tenant_id ?? null,
      permissions: permissions.map((p) => p.key),
    },
    jwtSecret,
  );

  return { accessToken: access.token, expiresIn: access.expiresIn };
}

/** Verify an access token (from Authorization header) and return the payload. */
export async function resolveSession(
  jwtSecret: string,
  authHeader: string | undefined | null,
): Promise<AccessTokenUser> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ERROR_CODES.AUTH_NO_SESSION, 'التوكن غير موجود');
  }
  const token = authHeader.slice(7).trim();
  try {
    const payload = await verifyAccessToken(token, jwtSecret);
    return {
      id: payload.sub,
      username: payload.username,
      roleId: payload.roleId,
      roleKey: payload.roleKey,
      branchId: payload.branchId,
      tenantId: payload.tenantId ?? null,
      permissions: payload.permissions,
    };
  } catch {
    throw new AppError(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'انتهت صلاحية الجلسة');
  }
}

export interface AccessTokenUser {
  id: string;
  username: string;
  roleId: string;
  roleKey: RoleKey;
  branchId: string | null;
  tenantId: string | null;
  permissions: string[];
}

/** Get current user (for /auth/me). */
export async function getCurrentUser(
  supabase: LooseSupabaseClient,
  jwtSecret: string,
  authHeader: string | undefined | null,
): Promise<SessionResponse> {
  const sessionUser = await resolveSession(jwtSecret, authHeader);

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', sessionUser.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !user) {
    throw new AppError(ERROR_CODES.AUTH_NO_SESSION, 'المستخدم غير موجود');
  }

  const { role, permissions } = await loadRoleAndPermissions(supabase, user.role_id);
  return buildSessionResponse(user, role, permissions);
}

/** Change the current user's password. */
export async function changePassword(
  supabase: LooseSupabaseClient,
  jwtSecret: string,
  authHeader: string | undefined | null,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const sessionUser = await resolveSession(jwtSecret, authHeader);

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, password_hash')
    .eq('id', sessionUser.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !user || !user.password_hash) {
    throw new AppError(ERROR_CODES.AUTH_NO_SESSION, 'المستخدم غير موجود');
  }

  const valid = await verifySecret(input.currentPassword, user.password_hash);
  if (!valid) {
    throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'كلمة المرور الحالية غير صحيحة');
  }

  const newHash = await hashSecret(input.newPassword);
  const { error: updateErr } = await supabase
    .from('users')
    .update({
      password_hash: newHash,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('id', user.id);

  if (updateErr) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, updateErr.message);
  }

  await writeAuditLog(supabase, {
    userId: user.id,
    action: 'update',
    entity: 'users',
    entityId: user.id,
    after: { action: 'password_changed' },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────

async function loadRoleAndPermissions(
  supabase: LooseSupabaseClient,
  roleId: string,
): Promise<{ role: Role; permissions: Permission[] }> {
  const { data: role, error: roleErr } = await supabase
    .from('roles')
    .select('*')
    .eq('id', roleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (roleErr || !role) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'الدور غير موجود');
  }

  // Super admin: return all permissions (resolved from shared constants).
  if ((role as Role).key === 'super_admin') {
    const { data: allPerms, error: permErr } = await supabase
      .from('permissions')
      .select('*')
      .is('deleted_at', null);

    if (permErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, permErr.message);
    return { role: role as Role, permissions: (allPerms ?? []) as Permission[] };
  }

  // Other roles: load via role_permissions join.
  const { data: rolePerms, error: rpErr } = await supabase
    .from('role_permissions')
    .select('permission:permissions(*)')
    .eq('role_id', roleId)
    .is('deleted_at', null);

  if (rpErr) throw new AppError(ERROR_CODES.INTERNAL_ERROR, rpErr.message);

  const permissions = ((rolePerms as unknown as { permission: Permission }[] | null) ?? [])
    .map((rp) => rp.permission)
    .filter((p): p is Permission => p !== null);

  return { role: role as Role, permissions };
}

async function buildSessionResponse(
  user: User,
  role: Role,
  permissions: Permission[],
): Promise<SessionResponse> {
  const prefs: UserPreferences = (user.preferences as UserPreferences) ?? {
    theme: 'system',
    language: 'ar',
    sidebarCollapsed: false,
  };

  return {
    accessToken: '',
    refreshToken: '',
    expiresIn: 0,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      roleId: user.role_id,
      roleKey: role.key as RoleKey,
      branchId: user.branch_id,
      permissions: permissions.map((p) => p.key),
      preferences: prefs,
    },
  };
}

/** Audit logout — fire-and-forget. */
export async function auditLogout(
  supabase: LooseSupabaseClient,
  jwtSecret: string,
  authHeader: string | undefined | null,
): Promise<void> {
  try {
    const sessionUser = await resolveSession(jwtSecret, authHeader);
    await writeAuditLog(supabase, {
      userId: sessionUser.id,
      action: 'logout',
      entity: 'users',
      entityId: sessionUser.id,
    });
  } catch {
    // ignore — logout should always succeed for the client.
  }
}

export type { AuditAction };
