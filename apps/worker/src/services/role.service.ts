/**
 * Role + Permission service.
 *
 * Notes:
 *  - System roles (is_system = true) cannot be deleted.
 *  - Super_admin role permissions cannot be modified (always returns all perms).
 *  - When role permissions change, all users with that role get the new perms
 *    on their next token refresh.
 */
import {
  AppError,
  ERROR_CODES,
  type Role,
  type Permission,
  type CreateRoleInput,
  type UpdateRoleInput,
  type AssignPermissionsInput,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const ROLES_TABLE = 'roles';
const PERMS_TABLE = 'permissions';
const RP_TABLE = 'role_permissions';

/** List all permissions. */
export async function listPermissions(
  supabase: LooseSupabaseClient,
): Promise<Permission[]> {
  const { data, error } = await supabase
    .from(PERMS_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('module', { ascending: true })
    .order('action', { ascending: true });

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as Permission[];
}

/** List all roles with their permission count. */
export async function listRoles(
  supabase: LooseSupabaseClient,
): Promise<Role[]> {
  const { data, error } = await supabase
    .from(ROLES_TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as Role[];
}

/** Get a role with its permissions. */
export async function getRole(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<{ role: Role; permissions: Permission[] }> {
  const { data: role, error } = await supabase
    .from(ROLES_TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !role) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'الدور غير موجود');
  }

  const permissions = await getRolePermissions(supabase, id);
  return { role: role as Role, permissions };
}

/** Get permissions assigned to a role. Super_admin returns all. */
export async function getRolePermissions(
  supabase: LooseSupabaseClient,
  roleId: string,
): Promise<Permission[]> {
  const { role } = await getRole(supabase, roleId).catch(() => {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'الدور غير موجود');
  });

  if (role.key === 'super_admin') {
    return listPermissions(supabase);
  }

  const { data, error } = await supabase
    .from(RP_TABLE)
    .select('permission:permissions(*)')
    .eq('role_id', roleId)
    .is('deleted_at', null);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  return ((data as unknown as { permission: Permission }[] | null) ?? [])
    .map((rp) => rp.permission)
    .filter((p): p is Permission => p !== null);
}

/** Create a new custom role (is_system = false). */
export async function createRole(
  supabase: LooseSupabaseClient,
  input: CreateRoleInput,
  actor: AccessTokenUser,
): Promise<Role> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: role, error } = await supabase
    .from(ROLES_TABLE)
    .insert({
      id,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      is_system: false,
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
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'مفتاح الدور مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  // Assign initial permissions.
  if (input.permissionIds.length > 0) {
    await assignPermissions(supabase, id, { permissionIds: input.permissionIds }, actor);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: ROLES_TABLE,
    entityId: id,
    after: role as unknown as Record<string, unknown>,
  });

  return role as Role;
}

/** Update a role. System role's key cannot be changed. */
export async function updateRole(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateRoleInput,
  actor: AccessTokenUser,
): Promise<Role> {
  const existing = await getRole(supabase, id);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  // System role's key is immutable.
  if (input.key !== undefined && !existing.role.is_system) updates.key = input.key;

  const { data: updated, error } = await supabase
    .from(ROLES_TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: ROLES_TABLE,
    entityId: id,
    before: existing.role as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return updated as Role;
}

/** Replace a role's permissions (delete + insert). */
export async function assignPermissions(
  supabase: LooseSupabaseClient,
  roleId: string,
  input: AssignPermissionsInput,
  actor: AccessTokenUser,
): Promise<void> {
  const { role } = await getRole(supabase, roleId);

  if (role.is_system && role.key !== 'super_admin') {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'لا يمكن تعديل صلاحيات دور نظام. عدّل صلاحيات الأدوار المخصصة فقط.',
    );
  }

  const now = new Date().toISOString();

  // Soft-delete existing assignments.
  await supabase
    .from(RP_TABLE)
    .update({ deleted_at: now, updated_at: now })
    .eq('role_id', roleId)
    .is('deleted_at', null);

  // Insert new assignments.
  if (input.permissionIds.length > 0) {
    const rows = input.permissionIds.map((pid) => ({
      id: crypto.randomUUID(),
      role_id: roleId,
      permission_id: pid,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    }));

    const { error } = await supabase.from(RP_TABLE).insert(rows);
    if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: RP_TABLE,
    entityId: roleId,
    after: { permissionIds: input.permissionIds },
  });
}

/** Soft-delete a role. System roles cannot be deleted. */
export async function deleteRole(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const { role } = await getRole(supabase, id);

  if (role.is_system) {
    throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن حذف أدوار النظام');
  }

  // Check no users are assigned.
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', id)
    .is('deleted_at', null);

  if ((count ?? 0) > 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      'لا يمكن حذف دور مخصص لمستخدمين. أعد تعيين المستخدمين أولاً.',
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(ROLES_TABLE)
    .update({ deleted_at: now, updated_at: now, updated_by: actor.id })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'delete',
    entity: ROLES_TABLE,
    entityId: id,
    before: role as unknown as Record<string, unknown>,
  });
}
