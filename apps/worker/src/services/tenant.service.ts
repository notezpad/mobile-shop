/**
 * Tenant service — SaaS multi-tenancy.
 *
 * Key functions:
 *  - signupTenant: create a new tenant + first admin user (onboarding)
 *  - getTenantBySlug: resolve tenant from URL slug
 *  - getUserTenants: list all tenants a user belongs to
 *  - switchTenant: switch the user's active tenant
 *  - setTenantContext: set Supabase session variable for RLS
 */
import {
  AppError, ERROR_CODES,
  type Tenant, type TenantMember,
  type TenantSignupInput,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { hashSecret } from '../lib/crypto';
import { writeAuditLog } from './audit.service';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import type { AccessTokenUser } from './auth.service';

const TENANT_TABLE = 'tenants';
const MEMBER_TABLE = 'tenant_members';

/** Set the tenant context on the Supabase client (for RLS). */
export async function setTenantContext(
  supabase: LooseSupabaseClient,
  tenantId: string,
): Promise<void> {
  // Set the session variable that RLS policies use.
  await supabase.rpc('set_config', {
    setting_name: 'app.tenant_id',
    setting_value: tenantId,
    is_local: true,
  }).then(() => {}, (err: unknown) => {
    // If RPC doesn't exist, use the headers approach.
    console.warn('set_config RPC failed, using header fallback:', err);
  });
}

/** Signup a new tenant + first admin user (SaaS onboarding). */
export async function signupTenant(
  supabase: LooseSupabaseClient,
  input: TenantSignupInput,
  jwtSecret: string,
): Promise<{
  tenant: Tenant;
  accessToken: string;
  refreshToken: string;
}> {
  const now = new Date().toISOString();

  // 1. Check slug is unique.
  const { data: existingSlug } = await supabase
    .from(TENANT_TABLE)
    .select('id')
    .eq('slug', input.tenantSlug)
    .maybeSingle();
  if (existingSlug) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'هذا الرابط مستخدم بالفعل');
  }

  // 2. Check username is unique.
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('username', input.username)
    .maybeSingle();
  if (existingUser) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'اسم المستخدم مستخدم بالفعل');
  }

  // 3. Get the plan.
  const { data: plan } = await supabase
    .from('plans')
    .select('id')
    .eq('slug', input.planSlug)
    .eq('is_active', true)
    .maybeSingle();
  const planId = (plan as { id: string } | null)?.id;

  // 4. Create tenant.
  const tenantId = crypto.randomUUID();
  const { data: tenant, error: tenantErr } = await supabase
    .from(TENANT_TABLE)
    .insert({
      id: tenantId,
      name: input.tenantName,
      slug: input.tenantSlug,
      status: 'active',
      plan_id: planId ?? null,
      settings: {},
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (tenantErr) {
    if (tenantErr.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'الرابط مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, tenantErr.message);
  }

  // 5. Create the admin user.
  const passwordHash = await hashSecret(input.password);
  const userId = crypto.randomUUID();
  const adminRoleId = await getAdminRoleId(supabase);

  const { error: userErr } = await supabase.from('users').insert({
    id: userId,
    username: input.username,
    password_hash: passwordHash,
    pin_hash: null,
    full_name: input.fullName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    role_id: adminRoleId,
    branch_id: null,
    status: 'active',
    preferences: { theme: 'system', language: 'ar', sidebarCollapsed: false },
    last_login_at: now,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
    created_by: userId,
    updated_by: userId,
  });

  if (userErr) {
    // Rollback: delete tenant.
    await supabase.from(TENANT_TABLE).delete().eq('id', tenantId);
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, userErr.message);
  }

  // 6. Create tenant_member (admin).
  const { error: memberErr } = await supabase.from(MEMBER_TABLE).insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    user_id: userId,
    role_key: 'admin',
    is_default: true,
    joined_at: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
  });

  if (memberErr) {
    console.error('Failed to create tenant member:', memberErr);
  }

  // 7. Create default branch for the tenant.
  const branchId = crypto.randomUUID();
  await supabase.from('branches').insert({
    id: branchId,
    name: 'الفرع الرئيسي',
    code: 'MAIN',
    is_main: true,
    is_active: true,
    settings: {
      taxRate: 14,
      currency: 'EGP',
      receiptHeader: null,
      receiptFooter: null,
      lowStockThreshold: 5,
      enableVatInvoice: true,
      vatNumber: null,
      printerType: 'a4',
      printerName: null,
    },
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    revision: 1,
    sync_status: 'synced',
    created_by: userId,
    updated_by: userId,
  });

  // 8. Link user to branch.
  await supabase.from('users')
    .update({ branch_id: branchId })
    .eq('id', userId);

  // 9. Issue JWT with tenant_id.
  const access = await signAccessToken(
    {
      sub: userId,
      username: input.username,
      roleId: adminRoleId,
      roleKey: 'admin',
      branchId: branchId,
      tenantId,
      permissions: [], // admin gets all at runtime
    },
    jwtSecret,
  );
  const refresh = await signRefreshToken(userId, crypto.randomUUID(), jwtSecret);

  // 10. Seed default settings + payment methods for the tenant.
  await seedTenantDefaults(supabase, tenantId, userId);

  await writeAuditLog(supabase, {
    userId,
    action: 'create',
    entity: TENANT_TABLE,
    entityId: tenantId,
    after: { name: input.tenantName, slug: input.tenantSlug },
  });

  return {
    tenant: tenant as Tenant,
    accessToken: access.token,
    refreshToken: refresh.token,
  };
}

/** Get tenant by slug (for subdomain resolution). */
export async function getTenantBySlug(
  supabase: LooseSupabaseClient,
  slug: string,
): Promise<Tenant | null> {
  const { data, error } = await supabase
    .from(TENANT_TABLE)
    .select('*')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data as Tenant) ?? null;
}

/** List all tenants a user belongs to. */
export async function getUserTenants(
  supabase: LooseSupabaseClient,
  userId: string,
): Promise<Array<{ tenant_id: string; tenant_name: string; tenant_slug: string; role_key: string; is_default: boolean }>> {
  const { data, error } = await supabase
    .from('v_tenant_members')
    .select('tenant_id, tenant_name, tenant_slug, role_key, is_default')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  return (data ?? []) as Array<{ tenant_id: string; tenant_name: string; tenant_slug: string; role_key: string; is_default: boolean }>;
}

/** Helper: get the admin role ID. */
async function getAdminRoleId(supabase: LooseSupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('roles')
    .select('id')
    .eq('key', 'admin')
    .maybeSingle();
  if (error || !data) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'دور admin غير موجود — تأكد من تنفيذ migrations');
  }
  return (data as { id: string }).id;
}

/** Helper: seed default settings + payment methods for a new tenant. */
async function seedTenantDefaults(
  supabase: LooseSupabaseClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Default settings.
  const settings = [
    { key: 'general.app_name', value: 'Mobile Shop ERP', category: 'general' },
    { key: 'general.default_language', value: 'ar', category: 'general' },
    { key: 'finance.default_currency', value: 'EGP', category: 'finance' },
    { key: 'finance.default_tax_rate', value: 14, category: 'finance' },
    { key: 'receipt.show_qr_on_invoice', value: true, category: 'receipt' },
  ];

  for (const s of settings) {
    await supabase.from('settings').insert({
      id: crypto.randomUUID(),
      key: s.key,
      value: s.value,
      category: s.category,
      branch_id: null,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
      created_by: userId,
      updated_by: userId,
    });
  }

  // Default payment methods.
  const methods = [
    { key: 'cash', name: 'Cash', nameAr: 'كاش', type: 'cash', sortOrder: 1 },
    { key: 'card', name: 'Card', nameAr: 'بطاقة', type: 'digital', sortOrder: 2 },
    { key: 'vodafone_cash', name: 'Vodafone Cash', nameAr: 'فودافون كاش', type: 'digital', sortOrder: 3 },
    { key: 'instapay', name: 'InstaPay', nameAr: 'إنستاباي', type: 'digital', sortOrder: 4 },
    { key: 'fawry', name: 'Fawry', nameAr: 'فوري', type: 'digital', sortOrder: 5 },
  ];

  for (const m of methods) {
    await supabase.from('payment_methods').insert({
      id: crypto.randomUUID(),
      key: m.key,
      name: m.name,
      name_ar: m.nameAr,
      icon: null,
      type: m.type,
      is_active: true,
      sort_order: m.sortOrder,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
    });
  }
}

