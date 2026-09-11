'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { useVertical, VERTICAL_META, type Vertical } from './vertical-context'

const ORDER: Vertical[] = ['electronics', 'fashion']

export function VerticalSwitch({ className = '' }: { className?: string }) {
  const { vertical, setVertical } = useVertical()

  return (
    <div
      role="tablist"
      aria-label="اختر نشاط محلك"
      className={
        'glass-pill relative inline-flex items-center rounded-full p-1 ' + className
      }
    >
      {ORDER.map((v) => {
        const meta = VERTICAL_META[v]
        const Icon = meta.icon
        const active = vertical === v
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setVertical(v)}
            className={
              'relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors sm:text-sm ' +
              (active ? 'text-white' : 'lg-muted hover:text-white')
            }
          >
            {active && (
              <motion.span
                layoutId="vertical-switch-pill"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_4px_16px_-4px] shadow-brand-600/50"
              />
            )}
            <Icon className="size-3.5 shrink-0" />
            {meta.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
