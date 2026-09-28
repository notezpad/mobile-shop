// Unit-Based Dynamic Pricing for Wholesale POS.
//
// Applies ONLY to the retail unit (Piece / قطعة). Wholesale units
// (ربع دستة، نص دستة، دستة، ...) keep their own manually-set
// ProductUnit.price untouched — this module never reads or writes those.
//
// Retail price = cost per piece + margin%, where margin is resolved as:
//   Product.retailMarginPercent (per-product override, if set)
//   → Tenant.defaultRetailMarginPercent (global default, e.g. 20)
//
// This never overwrites Product.price / Product.cost / ProductUnit.price in
// the database — it's computed on read, for display/POS purposes only.

export interface RetailPricingTenant {
  dynamicRetailPricingEnabled: boolean
  defaultRetailMarginPercent: number
}

export interface RetailPricingProduct {
  cost: number
  retailMarginPercent: number | null
}

/** Effective margin % for this product: its own override, else the tenant default. */
export function resolveRetailMarginPercent(
  product: RetailPricingProduct,
  tenant: RetailPricingTenant
): number {
  return product.retailMarginPercent ?? tenant.defaultRetailMarginPercent
}

/**
 * The dynamically computed retail (Piece / قطعة) price, or null when the
 * feature is off for this tenant — callers should fall back to the flat
 * Product.price in that case, exactly like before this feature existed.
 */
export function computeDynamicRetailPrice(
  product: RetailPricingProduct,
  tenant: RetailPricingTenant
): number | null {
  if (!tenant.dynamicRetailPricingEnabled) return null
  const margin = resolveRetailMarginPercent(product, tenant)
  const price = product.cost * (1 + margin / 100)
  return Number(price.toFixed(2))
}
