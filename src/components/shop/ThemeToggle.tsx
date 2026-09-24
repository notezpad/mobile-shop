'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="size-9" />

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title="تبديل السمة"
      aria-label="تبديل الوضع الليلي والنهاري"
      style={{
        width: 36, height: 36,
        borderRadius: 10,
        border: isDark
          ? '1.5px solid rgba(148,163,184,0.2)'
          : '1.5px solid rgba(251,191,36,0.6)',
        background: isDark
          ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)'
          : 'linear-gradient(145deg, #fef9c3 0%, #fde68a 60%, #fbbf24 100%)',
        boxShadow: isDark
          ? '0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
          : '0 2px 8px rgba(251,191,36,0.45), 0 1px 2px rgba(180,83,9,0.2), inset 0 1px 0 rgba(255,255,255,0.6)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      {/* Top shine */}
      {!isDark && (
        <span style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, rgba(255,255,255,0.55) 0%, transparent 50%)',
          borderRadius: 'inherit', pointerEvents: 'none',
        }} />
      )}

      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          /* ── Moon ── */
          <motion.span key="moon"
            initial={{ rotate: -60, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0,   opacity: 1, scale: 1   }}
            exit={{    rotate:  60, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d="M17.5 11.9A7.9 7.9 0 0 1 8.1 2.5a7.9 7.9 0 1 0 9.4 9.4Z"
                fill="#e2e8f0"
                style={{ filter: 'drop-shadow(0 0 3px rgba(226,232,240,0.8))' }}
              />
            </svg>
          </motion.span>
        ) : (
          /* ── Sun ── */
          <motion.span key="sun"
            initial={{ rotate: -60, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0,   opacity: 1, scale: 1   }}
            exit={{    rotate:  60, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              {/* Rays */}
              <g stroke="#b45309" strokeWidth="1.8" strokeLinecap="round">
                <line x1="10" y1="1"   x2="10" y2="3.2"  />
                <line x1="10" y1="16.8" x2="10" y2="19"  />
                <line x1="1"  y1="10"  x2="3.2" y2="10"  />
                <line x1="16.8" y1="10" x2="19" y2="10"  />
                <line x1="3.5" y1="3.5" x2="5.1" y2="5.1"  />
                <line x1="14.9" y1="14.9" x2="16.5" y2="16.5" />
                <line x1="3.5" y1="16.5" x2="5.1" y2="14.9" />
                <line x1="14.9" y1="5.1" x2="16.5" y2="3.5" />
              </g>
              {/* Core */}
              <circle cx="10" cy="10" r="4.2" fill="#f59e0b"
                style={{ filter: 'drop-shadow(0 0 2px rgba(245,158,11,0.6))' }} />
              {/* Highlight */}
              <circle cx="8.5" cy="8.5" r="1.4" fill="rgba(255,255,255,0.45)" />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
