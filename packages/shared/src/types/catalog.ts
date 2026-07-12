import type { BaseEntity, UUID } from './base';

/** Branch (store location). Multi-branch from day one. */
export interface Branch extends BaseEntity {
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_main: boolean;
  is_active: boolean;
  /** Per-branch settings (tax rate, currency, receipt header…). */
  settings: BranchSettings;
}

export interface BranchSettings {
  taxRate: number;
  currency: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  lowStockThreshold: number;
  enableVatInvoice: boolean;
  vatNumber: string | null;
  printerType: 'thermal_80' | 'thermal_58' | 'a4' | 'none';
  printerName: string | null;
}

/** Product category — supports nested tree via parent_id. */
export interface Category extends BaseEntity {
  name: string;
  slug: string;
  parent_id: UUID | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
}

/** Whether a product is tracked by serial/IMEI. */
export type ProductType = 'standard' | 'imei' | 'service';

export interface Product extends BaseEntity {
  sku: string;
  barcode: string | null;
  name: string;
  name_ar: string | null;
  category_id: UUID | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  type: ProductType;
  unit: string;
  cost_price: number;
  sale_price: number;
  wholesale_price: number | null;
  tax_rate: number;
  /** For IMEI products: minimum stock alert per branch. */
  min_quantity: number;
  has_warranty: boolean;
  warranty_days: number;
  image_url: string | null;
  is_active: boolean;
}

/**
 * Individual physical unit for IMEI-tracked products.
 * One row per IMEI — tracks its lifecycle (received → sold → returned).
 */
export type DeviceUnitStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'defective';

export interface DeviceUnit extends BaseEntity {
  product_id: UUID;
  imei1: string;
  imei2: string | null;
  serial_number: string | null;
  branch_id: UUID;
  status: DeviceUnitStatus;
  cost: number;
  sale_price: number;
  /** Reference to the sale that consumed this unit (if sold). */
  sale_id: UUID | null;
  received_at: string;
}

export interface Supplier extends BaseEntity {
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
  notes: string | null;
  is_active: boolean;
}
