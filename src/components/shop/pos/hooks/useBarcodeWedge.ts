'use client'

import * as React from 'react'

/**
 * Keyboard-wedge barcode scanners "type" the code very fast and end with Enter.
 * This catches a scan even when focus is NOT in the search box (as long as it's
 * not in another input and no dialog is open). Human typing is slower than
 * MAX_GAP so it's ignored.
 */
const MAX_GAP_MS = 50
const MIN_LEN = 4

export function useBarcodeWedge(onScan: (code: string) => void) {
  const cb = React.useRef(onScan)
  cb.current = onScan

  React.useEffect(() => {
    let buf = ''
    let last = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return

      const now = performance.now()
      if (e.key === 'Enter') {
        if (buf.length >= MIN_LEN) {
          e.preventDefault()
          const code = buf
          buf = ''
          cb.current(code)
        }
        buf = ''
        return
      }
      if (e.key.length !== 1) return
      if (now - last > MAX_GAP_MS) buf = '' // too slow → a human, restart
      buf += e.key
      last = now
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
