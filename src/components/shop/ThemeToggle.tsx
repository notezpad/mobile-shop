'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="size-10" />

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title="تبديل السمة"
      aria-label="تبديل الوضع الليلي والنهاري"
      className="shell-icon-btn"
    >
      {/* ⚡ PERF FIX (2026-10-05): بدل framer-motion — أيقونة بتدور وتظهر
          بـ CSS keyframes (theme-icon-in) مع تعريف key في كل مفتاح.
          نفس الإحساس البصري بدون أي JS مكتبة في الـ shell. */}
      <span
        key={isDark ? 'moon' : 'sun'}
        className="flex items-center justify-center theme-icon-swap"
      >
        {isDark ? (
          <Moon className="size-[18px] text-sky-300" strokeWidth={2} />
        ) : (
          <Sun className="size-[18px] text-amber-500" strokeWidth={2} />
        )}
      </span>
    </button>
  )
}
