/**
 * POS shared types — single source of truth for POSView (legacy) and the
 * v2 split components. Pure types only (no React, no I/O).
 */

export interface ProductLite {
  id: number
  name: string
  barcode: string | null
  price: number
  quantity: number
  // Set by the API when the search term exactly matched one of this
  // product's variant (color/size) barcodes.
  matchedVariantId?: number | null
  matchedVariantLabel?: string | null
  // Unit-Based Dynamic Pricing: cost + margin% (Piece unit only), else null.
  dynamicRetailPrice?: number | null
  // Extra columns already returned by /api/products (used by the catalog tiles).
  imagePath?: string | null
  category?: string | null
  minQuantity?: number | null
}

export interface CustomerLite {
  id: number
  name: string
  phone: string | null
  balance: number
}

export interface PosUnit {
  id: number
  name: string
  price: number | null
  factor: number
}

// A specific size/color of a product — its own stock, sold as a distinct line.
export interface PosVariant {
  id: number
  size: string | null
  color: string | null
  quantity: number
}

// Each cart line is uniquely identified by cartKey = productId-unitId-variantId
export interface CartLine {
  cartKey: string
  product: ProductLite
  price: number // price PER PIECE (unit price ÷ factor when a unit is selected)
  quantity: number // quantity in PIECES — a multiple of unitFactor when a unit is selected
  maxQuantity: number // stock ceiling in pieces (rounded down to a multiple of unitFactor)
  unitId: number | null
  unitLabel: string | null
  unitFactor: number // pieces per unit; 1 when no wholesale unit is selected
  availableUnits: PosUnit[]
  variantId: number | null
  variantLabel: string | null
  availableVariants: PosVariant[]
}

/** Item shape expected by POST /api/sales (unchanged from the legacy POS). */
export interface SaleItemPayload {
  productId: number
  quantity: number
  price: number
  unitId?: number
  variantId?: number
}
