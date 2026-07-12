/**
 * Tenant types + schemas for SaaS multi-tenancy.
 */
import type { BaseEntity, UUID } from './base';

/** Tenant status. */
export type TenantStatus = 'active' | 'suspended' | 'canceled';

/** A tenant = one shop/company using the SaaS. */
export interface Tenant extends BaseEntity {
  name: string;
  slug: string;
  domain: string | null;
  status: TenantStatus;
  plan_id: UUID | null;
  settings: Record<string, unknown>;
}

/** Maps a user to a tenant (a user can belong to multiple tenants). */
export interface TenantMember extends BaseEntity {
  tenant_id: UUID;
  user_id: UUID;
  role_key: string;
  is_default: boolean;
  invited_by: UUID | null;
  invited_at: string | null;
  joined_at: string;
}

/** Subscription plan (Stripe-ready). */
export interface Plan extends BaseEntity {
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_branches: number;
  max_users: number;
  max_products: number;
  features: Record<string, unknown>;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Subscription (Stripe-ready). */
export interface Subscription extends BaseEntity {
  tenant_id: UUID;
  plan_id: UUID;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'paused';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}
