import { z } from 'zod';
import { nonEmptyString, uuidSchema } from './common';

/**
 * Tenant signup — creates a new tenant + first admin user.
 * This is the SaaS onboarding flow.
 */
export const tenantSignupSchema = z.object({
  // Tenant info
  tenantName: nonEmptyString.min(2).max(200),
  tenantSlug: nonEmptyString.min(2).max(50)
    .regex(/^[a-z0-9-]+$/, 'أحرف إنجليزية صغيرة وأرقام وشرطات فقط'),
  
  // First admin user info
  username: nonEmptyString.min(3).max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'أحرف إنجليزية وأرقام فقط'),
  password: nonEmptyString.min(8),
  fullName: nonEmptyString.min(3).max(100),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  
  // Plan
  planSlug: z.string().default('free'),
});

export type TenantSignupInput = z.infer<typeof tenantSignupSchema>;

/** Switch active tenant (for users belonging to multiple tenants). */
export const switchTenantSchema = z.object({
  tenantId: uuidSchema,
});

export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;

/** Invite a user to a tenant. */
export const inviteToTenantSchema = z.object({
  username: nonEmptyString.min(3).max(50),
  roleKey: z.enum(['admin', 'manager', 'cashier', 'technician', 'accountant']).default('cashier'),
});

export type InviteToTenantInput = z.infer<typeof inviteToTenantSchema>;
