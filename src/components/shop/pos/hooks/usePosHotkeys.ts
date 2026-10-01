'use client'

import * as React from 'react'

export interface HotkeyHandlers {
  onFocusSearch: () => void
  onCustomer: () => void
  onDiscount: () => void
  onHold: () => void
  onPay: () => void
  onShortcuts: () => void
  onClearTicket: () => void
  /** Active-line actions (act on the highlighted ticket line). */
  onMoveActive: (dir: 1 | -1) => void
  onQtyDelta: (delta: 1 | -1) => void
  onRemoveActive: () => void
  /** True while the search box is the focused element AND empty (then +/−/Delete/↑↓ belong to the ticket, not to text editing). */
  isSearchIdle: () => boolean
}

const isTyping = (t: HTMLElement | null) =>
  !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
const dialogOpen = () => !!document.querySelector('[role="dialog"]')
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

/**
 * POS hotkeys. Uses event.code (physical key) — NOT event.key — so they work on the Arabic layout too.
 *   F2 · /  search      F4 customer     F6 discount      F8 hold        F9 · Ctrl+Enter pay
 *   ↑ ↓ + − Delete      active ticket line (when search is empty)
 *   Esc Esc             clear the ticket (with confirm) — first Esc is left to the search/popovers
 *   ? · Ctrl+/          shortcuts
 */
export function usePosHotkeys(h: HotkeyHandlers) {
  const ref = React.useRef(h)
  ref.current = h

  React.useEffect(() => {
    let lastEsc = -Infinity
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = isTyping(t)
      const k = ref.current
      const blocked = dialogOpen() // a dialog owns the keyboard (Esc, typing…) — except Ctrl+Enter/F9 in none

      if (e.code === 'F2' || (e.code === 'Slash' && !typing && !e.ctrlKey && !e.metaKey && !e.shiftKey)) {
        if (blocked) return
        e.preventDefault()
        k.onFocusSearch()
      } else if (e.code === 'F9' || (e.code === 'Enter' && (e.ctrlKey || e.metaKey))) {
        if (blocked) return
        e.preventDefault()
        k.onPay()
      } else if (e.code === 'F4' && isDesktop()) {
        if (blocked) return
        e.preventDefault()
        k.onCustomer()
      } else if (e.code === 'F6' && isDesktop()) {
        if (blocked) return
        e.preventDefault()
        k.onDiscount()
      } else if (e.code === 'F8') {
        if (blocked) return
        e.preventDefault()
        k.onHold()
      } else if ((e.code === 'Slash' && (e.ctrlKey || e.metaKey)) || (e.code === 'Slash' && e.shiftKey && !typing)) {
        if (blocked) return
        e.preventDefault()
        k.onShortcuts()
      } else if (!blocked && (!typing || k.isSearchIdle()) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          e.preventDefault()
          k.onMoveActive(e.code === 'ArrowDown' ? 1 : -1)
        } else if (e.code === 'NumpadAdd' || e.code === 'Equal') {
          e.preventDefault()
          k.onQtyDelta(1)
        } else if (e.code === 'NumpadSubtract' || e.code === 'Minus') {
          e.preventDefault()
          k.onQtyDelta(-1)
        } else if (e.code === 'Delete') {
          e.preventDefault()
          k.onRemoveActive()
        } else if (e.code === 'Escape') {
          // Esc #1 is consumed by the search box / popovers. Esc #2 within 800ms (search already empty) → clear ticket.
          const now = performance.now()
          if (now - lastEsc < 800) {
            lastEsc = -Infinity
            k.onClearTicket()
          } else {
            lastEsc = now
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
