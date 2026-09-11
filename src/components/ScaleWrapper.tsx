'use client'

import { usePageScale } from '@/hooks/usePageScale'

/**
 * ScaleWrapper — "الصفحة كوحدة واحدة" scaling for small viewports.
 *
 * Strategy (RTL-aware, no CSS zoom):
 *
 *   ┌────────────────── Outer (position:fixed) ──────────────────┐
 *   │  width  = window.innerWidth  px   (exact real pixels)      │
 *   │  height = window.innerHeight px   overflow:hidden          │
 *   │                                                            │
 *   │  ┌──────── Inner (position:absolute, right:0, top:0) ────┐ │
 *   │  │  width  = innerWidth  px  (= windowWidth  / scale)    │ │
 *   │  │  height = innerHeight px  (= windowHeight / scale)    │ │
 *   │  │  transform: scale(scale)   transformOrigin: top right │ │
 *   │  │                                                        │ │
 *   │  │  ← your entire app lives here, at its natural size →  │ │
 *   │  └────────────────────────────────────────────────────────┘ │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Why this works for RTL layouts:
 *   • The inner div is anchored to the outer's RIGHT edge (right:0).
 *   • It overflows to the LEFT, which is hidden by overflow:hidden.
 *   • scale() from "top right" shrinks the inner div so its visual
 *     footprint lands exactly on [0 … windowWidth] × [0 … windowHeight].
 *   • position:fixed children (e.g. the sidebar) become "fixed" to the
 *     inner container's stacking context — exactly the desired behaviour.
 *   • --app-h is set on :root so h-screen / min-h-screen utilities
 *     expand to innerHeight instead of 100vh, filling the scaled canvas.
 *
 * When scale === 1 (large screens) the wrapper is a no-op React fragment —
 * zero DOM overhead, no stacking-context side-effects.
 */
export function ScaleWrapper({ children }: { children: React.ReactNode }) {
  const { windowWidth, windowHeight, innerWidth, innerHeight, scale, mounted } = usePageScale()

  // ── No-op cases ──────────────────────────────────────────────────────────
  // 1. SSR / pre-hydration — render children as-is to avoid hydration mismatch.
  // 2. Scale = 1 — no scaling needed; skip all wrapper DOM overhead.
  if (!mounted || scale === 1) {
    return <>{children}</>
  }

  // ── Two-container scale approach ─────────────────────────────────────────
  return (
    <div
      // ── Outer ─────────────────────────────────────────────────────────────
      // Exact real-pixel viewport box.  Clips the inner container that
      // is physically wider/taller before the transform is applied.
      style={{
        position: 'fixed',
        top: 0,
        left: 0,          // explicit left:0 so the fixed box starts at viewport left
        width:  `${windowWidth}px`,
        height: `${windowHeight}px`,
        overflow: 'hidden',
        // No background — we let the body/html background show through,
        // which is identical to the app's own background colour.
      }}
    >
      <div
        // ── Inner ────────────────────────────────────────────────────────────
        // Logical-size container (windowWidth/scale × windowHeight/scale).
        // Scaled down so its visual footprint equals the real viewport.
        // Anchored to the outer's RIGHT edge for RTL:
        //   right edge stays at windowWidth → transform-origin:top right keeps it pinned.
        style={{
          position: 'absolute',
          right: 0,         // RTL anchor — right edge flush with outer right edge
          top: 0,
          width:  `${innerWidth}px`,
          height: `${innerHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top right',  // RTL: scale from the top-right corner
        }}
      >
        {children}
      </div>
    </div>
  )
}
