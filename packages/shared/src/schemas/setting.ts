import { z } from 'zod';
import { nonEmptyString, uuidSchema } from './common';

/**
 * Settings schema — generic key-value store with category grouping.
 *
 * Categories (predefined):
 *  - general     : app name, logo, language, timezone
 *  - finance     : default currency, tax rates, payment methods toggles
 *  - receipt     : invoice template, header/footer text, printer config
 *  - notifications: low-stock alerts, repair status change alerts
 *  - sync        : sync interval, conflict resolution strategy
 *  - security    : password policy, session timeout, 2FA settings
 */
export const settingCategorySchema = z.enum([
  'general',
  'finance',
  'receipt',
  'notifications',
  'sync',
  'security',
]);

export type SettingCategory = z.infer<typeof settingCategorySchema>;

export const upsertSettingSchema = z.object({
  key: nonEmptyString.min(1).max(100),
  // `value` can be any JSON-serializable: string, number, boolean, array, object.
  value: z.unknown(),
  category: settingCategorySchema,
  branchId: uuidSchema.nullable().optional(),
});

/** Manually-typed version that marks `value` as required (Zod v3 limitation). */
export interface UpsertSettingInput {
  key: string;
  value: unknown;
  category: SettingCategory;
  branchId?: string | null;
}

export const batchUpsertSettingsSchema = z.object({
  settings: z.array(upsertSettingSchema),
});

export type BatchUpsertSettingsInput = z.infer<typeof batchUpsertSettingsSchema>;

export const settingsQuerySchema = z.object({
  category: settingCategorySchema.optional(),
  branchId: uuidSchema.optional(),
});

export type SettingsQuery = z.infer<typeof settingsQuerySchema>;

/** Frontend-facing setting shape (no DB row metadata). */
export interface Setting {
  key: string;
  value: unknown;
  category: SettingCategory;
  branchId: string | null;
}

/** Type-safe access for known settings keys. */
export const SETTING_KEYS = {
  // general
  APP_NAME: 'general.app_name',
  APP_LOGO_URL: 'general.app_logo_url',
  DEFAULT_LANGUAGE: 'general.default_language',
  TIMEZONE: 'general.timezone',
  // finance
  DEFAULT_CURRENCY: 'finance.default_currency',
  DEFAULT_TAX_RATE: 'finance.default_tax_rate',
  ENABLE_MULTI_TAX: 'finance.enable_multi_tax',
  ENABLE_PAYMENT_METHODS: 'finance.enabled_payment_methods', // JSON array
  // receipt
  INVOICE_TEMPLATE: 'receipt.invoice_template',
  INVOICE_HEADER: 'receipt.invoice_header',
  INVOICE_FOOTER: 'receipt.invoice_footer',
  SHOW_QR_ON_INVOICE: 'receipt.show_qr_on_invoice',
  SHOW_BARCODE_ON_INVOICE: 'receipt.show_barcode_on_invoice',
  // notifications
  LOW_STOCK_ALERT: 'notifications.low_stock_alert',
  REPAIR_STATUS_ALERT: 'notifications.repair_status_alert',
  // sync
  SYNC_INTERVAL_MS: 'sync.interval_ms',
  SYNC_CONFLICT_STRATEGY: 'sync.conflict_strategy', // 'last_write_wins' | 'manual'
  // security
  PASSWORD_MIN_LENGTH: 'security.password_min_length',
  SESSION_TIMEOUT_MIN: 'security.session_timeout_min',
  REQUIRE_PIN: 'security.require_pin',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Default settings applied on first install. */
export const DEFAULT_SETTINGS: Record<string, { value: unknown; category: SettingCategory }> = {
  [SETTING_KEYS.APP_NAME]: { value: 'Mobile Shop ERP', category: 'general' },
  [SETTING_KEYS.DEFAULT_LANGUAGE]: { value: 'ar', category: 'general' },
  [SETTING_KEYS.TIMEZONE]: { value: 'Africa/Cairo', category: 'general' },
  [SETTING_KEYS.DEFAULT_CURRENCY]: { value: 'EGP', category: 'finance' },
  [SETTING_KEYS.DEFAULT_TAX_RATE]: { value: 14, category: 'finance' },
  [SETTING_KEYS.ENABLE_MULTI_TAX]: { value: false, category: 'finance' },
  [SETTING_KEYS.ENABLE_PAYMENT_METHODS]: {
    value: ['cash', 'card', 'vodafone_cash', 'instapay', 'fawry'],
    category: 'finance',
  },
  [SETTING_KEYS.INVOICE_TEMPLATE]: { value: 'standard_a4', category: 'receipt' },
  [SETTING_KEYS.SHOW_QR_ON_INVOICE]: { value: true, category: 'receipt' },
  [SETTING_KEYS.SHOW_BARCODE_ON_INVOICE]: { value: false, category: 'receipt' },
  [SETTING_KEYS.LOW_STOCK_ALERT]: { value: true, category: 'notifications' },
  [SETTING_KEYS.REPAIR_STATUS_ALERT]: { value: true, category: 'notifications' },
  [SETTING_KEYS.SYNC_INTERVAL_MS]: { value: 30_000, category: 'sync' },
  [SETTING_KEYS.SYNC_CONFLICT_STRATEGY]: { value: 'last_write_wins', category: 'sync' },
  [SETTING_KEYS.PASSWORD_MIN_LENGTH]: { value: 8, category: 'security' },
  [SETTING_KEYS.SESSION_TIMEOUT_MIN]: { value: 15, category: 'security' },
  [SETTING_KEYS.REQUIRE_PIN]: { value: false, category: 'security' },
};
