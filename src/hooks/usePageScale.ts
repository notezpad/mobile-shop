'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Scale breakpoints ────────────────────────────────────────────────────────
// Each tier is chosen so that innerWidth = windowWidth ÷ scale is always wide
// enough to contain the widest data tables without triggering horizontal scroll.
//
//   ≤ 1280 px  →  80 %   innerWidth ≈ 1600 px  (13" / 125-150 % zoom)
//   ≤ 1366 px  →  85 %   innerWidth ≈ 1607 px  ← 1366×768 الأكثر انتشاراً
//   ≤ 1536 px  →  90 %   innerWidth ≈ 1707 px  (14" / 110-125 % zoom)
//   anything else → 100 %  (no scaling, zero overhead)
//
// الـ 1366px breakpoint هو القلب: بدونه الشاشة دي بتاخد scale=0.9
// فـ innerWidth = 1518px بس، وأي جدول بـ min-width ≥ 1600px بيفضل ليه scroll.
// بـ scale=0.85 → innerWidth = 1607px → الجداول بتتسع بالظبط.
function getScale(windowWidth: number): number {
  if (windowWidth <= 1280) return 0.8
  if (windowWidth <= 1366) return 0.85   // 1366×768 — اللاب توب الرخيص الشائع
  if (windowWidth <= 1536) return 0.9
  return 1
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PageScaleDimensions {
  /** Actual pixels reported by the browser (= CSS px, respects browser zoom) */
  windowWidth: number
  windowHeight: number
  /** Logical dimensions of the inner container (= window ÷ scale) */
  innerWidth: number
  innerHeight: number
  /** Scale factor applied to the inner container (0 < scale ≤ 1) */
  scale: number
  /** false until the first useEffect fires (SSR / pre-hydration) */
  mounted: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
/**
 * Returns real pixel dimensions + the scale ratio needed to fit the page
 * neatly on small viewports.  Also keeps the CSS custom properties
 * `--app-h` and `--app-w` on :root in sync so that Tailwind's `h-screen` /
 * `min-h-screen` utilities expand to the *logical* inner size rather than the
 * raw viewport, preventing blank strips at the bottom after scaling.
 */
export function usePageScale(): PageScaleDimensions {
  const [dims, setDims] = useState<PageScaleDimensions>({
    windowWidth: 0,
    windowHeight: 0,
    innerWidth: 0,
    innerHeight: 0,
    scale: 1,
    mounted: false,
  })

  const update = useCallback(() => {
    const windowWidth  = window.innerWidth
    const windowHeight = window.innerHeight
    const scale        = getScale(windowWidth)
    const innerWidth   = windowWidth  / scale
    const innerHeight  = windowHeight / scale

    // Keep CSS custom properties in sync so that classes using var(--app-h)
    // (e.g. our overridden h-screen / min-h-screen) resolve to the logical
    // inner height and render correctly inside the scaled container.
    document.documentElement.style.setProperty('--app-h', `${innerHeight}px`)
    document.documentElement.style.setProperty('--app-w', `${innerWidth}px`)

    setDims({ windowWidth, windowHeight, innerWidth, innerHeight, scale, mounted: true })
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [update])

  return dims
}
