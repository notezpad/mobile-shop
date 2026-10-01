'use client'

import * as React from 'react'
import { POSViewLegacy } from './POSViewLegacy'
import { PosScreen } from './pos/PosScreen'

/**
 * POS entry point — feature-flagged during the v2 rollout.
 *
 *   /pos?pos=v2      → enable v2 on this browser (saved in localStorage)
 *   /pos?pos=legacy  → back to the old POS (instant rollback)
 *
 * Default is the LEGACY screen until v2 is signed off. `POSViewLegacy` is kept
 * untouched as the safety net (only the quantity-input fix + success wording).
 */
const FLAG_KEY = 'pos-v2'

function readFlag(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('pos')
    if (q === 'v2') localStorage.setItem(FLAG_KEY, '1')
    else if (q === 'legacy') localStorage.removeItem(FLAG_KEY)
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function POSView() {
  const [v2, setV2] = React.useState<boolean | null>(null)
  React.useEffect(() => setV2(readFlag()), [])
  if (v2 === null) return null // avoids a legacy→v2 flash on mount
  return v2 ? <PosScreen /> : <POSViewLegacy />
}
