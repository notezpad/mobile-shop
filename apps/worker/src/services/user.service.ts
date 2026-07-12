/**
 * User service — CRUD for users.
 *
 * Notes:
 *  - Passwords/PINs hashed via crypto lib before persistence.
 *  - Super_admin cannot be deleted or suspended.
 *  - Self-deletion and self-suspension blocked.
 *  - Audit log written on every mutation.
 */
import {
  AppError,
  ERROR_CODES,
  type User,
  type PaginatedResult,
  type CreateUserInput,
  type UpdateUserInput,
  type UserQuery,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { hashSecret } from '../lib/crypto';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'users';

/** List users with pagination + filters. */
export async function listUsers(
  supabase: LooseSupabaseClient,
  query: UserQuery,
): Promise<PaginatedResult<User>> {
  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(`username.ilike.%${query.search}%,full_name.ilike.%${query.search}%,phone.ilike.%${query.search}%`);
  }
  if (query.roleId) q = q.eq('role_id', query.roleId);
  if (query.branchId) q = q.eq('branch_id', query.branchId);
  if (query.status) q = q.eq('status', query.status);

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'username': return 'username';
      case 'fullName': return 'full_name';
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  const users = (data ?? []) as User[];
  const total = count ?? 0;

  return {
    items: users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Get a single user by ID. */
export async function getUser(supabase: LooseSupabaseClient, id: string): Promise<User> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'المستخدم غير موجود');

  return data as User;
}

/** Create a new user. */
export async function createUser(
  supabase: LooseSupabaseClient,
  input: CreateUserInput,
  actor: AccessTokenUser,
): Promise<User> {
  // Validate role exists.
  const { data: role, error: roleErr } = await supabase
    .from('roles')
    .select('id, key')
    .eq('id', input.roleId)
    .is('deleted_at', null)
    .maybeSingle();

  if (roleErr || !role) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الدور المحدد غير موجود');
  }

  // Check unique username.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('username', input.username)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'اسم المستخدم مستخدم بالفعل');
  }

  if (input.email) {
    const { data: existingEmail } = await supabase
      .from(TABLE)
      .select('id')
      .eq('email', input.email)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingEmail) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'البريد الإلكتروني مستخدم بالفعل');
    }
  }

  const passwordHash = await hashSecret(input.password);
  const pinHash = input.pin ? await hashSecret(input.pin) : null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: user, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      username: input.username,
      password_hash: passwordHash,
      pin_hash: pinHash,
      full_name: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      avatar_url: null,
      role_id: input.roleId,
      branch_id: input.branchId ?? null,
      status: input.status,
      preferences: {
        theme: 'system',
        language: 'ar',
        sidebarCollapsed: false,
      },
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'القيمة مكررة');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: sanitizeUser(user as User),
  });

  return user as User;
}

/** Update a user (cannot change password/PIN here). */
export async function updateUser(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateUserInput,
  actor: AccessTokenUser,
): Promise<User> {
  const existing = await getUser(supabase, id);

  // Super_admin protection.
  if (existing.username === 'super_admin' && input.status === 'suspended') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن إيقاف super_admin');
  }

  // Self-suspension block.
  if (id === actor.id && input.status === 'suspended') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكنك إيقاف حسابك');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.fullName !== undefined) updates.full_name = input.fullName;
  if (input.email !== undefined) updates.email = input.email;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.roleId !== undefined) updates.role_id = input.roleId;
  if (input.branchId !== undefined) updates.branch_id = input.branchId;
  if (input.status !== undefined) updates.status = input.status;

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    before: sanitizeUser(existing),
    after: sanitizeUser(updated as User),
  });

  return updated as User;
}

/** Reset a user's password (admin operation). */
export async function resetPassword(
  supabase: LooseSupabaseClient,
  id: string,
  newPassword: string,
  actor: AccessTokenUser,
): Promise<void> {
  const user = await getUser(supabase, id);
  const newHash = await hashSecret(newPassword);

  const { error } = await supabase
    .from(TABLE)
    .update({
      password_hash: newHash,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    after: { action: 'password_reset', username: user.username },
  });
}

/** Set or update PIN. */
export async function setPin(
  supabase: LooseSupabaseClient,
  id: string,
  pin: string,
  actor: AccessTokenUser,
): Promise<void> {
  const pinHash = await hashSecret(pin);
  const { error } = await supabase
    .from(TABLE)
    .update({
      pin_hash: pinHash,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    after: { action: 'pin_set' },
  });
}

/** Soft-delete a user. Super_admin cannot be deleted. */
export async function deleteUser(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const user = await getUser(supabase, id);

  if (user.username === 'super_admin') {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن حذف super_admin');
  }
  if (id === actor.id) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكنك حذف حسابك');
  }

  const { error } = await supabase
    .from(TABLE)
    .update({
      deleted_at: new Date().toISOString(),
      status: 'suspended',
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'delete',
    entity: TABLE,
    entityId: id,
    before: sanitizeUser(user),
  });
}

/** Strip sensitive fields from a user object for audit logging. */
function sanitizeUser(user: User): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role_id: user.role_id,
    branch_id: user.branch_id,
    status: user.status,
  };
}
