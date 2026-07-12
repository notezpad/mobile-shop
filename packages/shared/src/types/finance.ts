import type { BaseEntity, UUID } from './base';
import type { PaymentMethodKey } from './sales';

/** Cashbox (per user, per branch, per day). */
export type CashboxStatus = 'open' | 'closed' | 'forced_closed';

export interface Cashbox extends BaseEntity {
  branch_id: UUID;
  user_id: UUID;
  opening_balance: number;
  closing_balance: number | null;
  expected_closing: number | null;
  /** Difference between expected and actual closing (for variance reports). */
  variance: number | null;
  opened_at: string;
  closed_at: string | null;
  status: CashboxStatus;
  notes: string | null;
}

export type CashboxTxnType = 'in' | 'out';

export interface CashboxTransaction extends BaseEntity {
  cashbox_id: UUID;
  type: CashboxTxnType;
  amount: number;
  payment_method: PaymentMethodKey;
  reason: string;
  ref_type: string | null;
  ref_id: UUID | null;
  user_id: UUID;
}

export interface ExpenseCategory extends BaseEntity {
  name: string;
  icon: string | null;
  is_system: boolean;
}

export interface Expense extends BaseEntity {
  branch_id: UUID;
  category_id: UUID;
  amount: number;
  payment_method: PaymentMethodKey;
  date: string;
  note: string | null;
  user_id: UUID;
  cashbox_id: UUID | null;
}

export interface RevenueCategory extends BaseEntity {
  name: string;
  icon: string | null;
  is_system: boolean;
}

export interface Revenue extends BaseEntity {
  branch_id: UUID;
  category_id: UUID;
  amount: number;
  payment_method: PaymentMethodKey;
  date: string;
  note: string | null;
  user_id: UUID;
  cashbox_id: UUID | null;
}

/** Configuration row for each payment method (enable/disable, display name). */
export interface PaymentMethod extends BaseEntity {
  key: PaymentMethodKey;
  name: string;
  name_ar: string;
  icon: string | null;
  type: 'cash' | 'digital' | 'credit';
  is_active: boolean;
  sort_order: number;
}
