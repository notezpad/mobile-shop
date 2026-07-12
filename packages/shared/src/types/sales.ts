import type { BaseEntity, UUID } from './base';

export type SaleStatus = 'draft' | 'completed' | 'voided' | 'refunded';
export type PaymentMethodKey =
  | 'cash'
  | 'card'
  | 'vodafone_cash'
  | 'instapay'
  | 'fawry'
  | 'credit' // customer balance
  | 'mixed';

export interface Customer extends BaseEntity {
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  /** Current outstanding balance (positive = customer owes us). */
  balance: number;
  credit_limit: number;
  notes: string | null;
  is_active: boolean;
  total_purchases: number;
  total_repairs: number;
}

export interface Sale extends BaseEntity {
  invoice_no: string;
  branch_id: UUID;
  customer_id: UUID | null;
  cashier_id: UUID;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  discount_type: 'amount' | 'percent';
  tax: number;
  total: number;
  paid: number;
  change: number;
  payment_method: PaymentMethodKey;
  /** For credit sales: amount still owed. */
  due_amount: number;
  notes: string | null;
  completed_at: string | null;
}

export interface SaleItem extends BaseEntity {
  sale_id: UUID;
  product_id: UUID;
  /** For IMEI products: link to the specific device unit sold. */
  device_unit_id: UUID | null;
  quantity: number;
  unit_price: number;
  discount: number;
  discount_type: 'amount' | 'percent';
  tax_rate: number;
  total: number;
}

export interface Invoice extends BaseEntity {
  sale_id: UUID;
  invoice_no: string;
  type: 'sale' | 'repair' | 'return';
  /** Stored as base64 in DB; rendered client-side for offline. */
  pdf_base64: string | null;
  qr_data: string | null;
  /** Total in figures (used for QR TLV encoding). */
  total: number;
  tax: number;
  issued_at: string;
}

export interface InvoicePayment extends BaseEntity {
  invoice_id: UUID;
  method: PaymentMethodKey;
  amount: number;
  /** Transaction reference (e.g. InstaPay ref, Fawry code, Vodafone txn id). */
  reference: string | null;
  paid_at: string;
}

/** Return against a sale (full or partial). */
export type ReturnStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface Return extends BaseEntity {
  return_no: string;
  sale_id: UUID;
  branch_id: UUID;
  customer_id: UUID | null;
  reason: string | null;
  total: number;
  status: ReturnStatus;
  /** How the refund was issued. */
  refund_method: PaymentMethodKey | 'store_credit';
  approved_by: UUID | null;
  approved_at: string | null;
}

export interface ReturnItem extends BaseEntity {
  return_id: UUID;
  sale_item_id: UUID;
  quantity: number;
  refund_amount: number;
}
