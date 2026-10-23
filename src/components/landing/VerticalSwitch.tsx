'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { useVertical, VERTICAL_META, type Vertical } from './vertical-context'

const ORDER: Vertical[] = ['electronics', 'fashion']

export function VerticalSwitch({ className = '', label }: { className?: string; label?: string }) {
  const { vertical, setVertical } = useVertical()

  return (
    <div
      role="tablist"
      aria-label="اختر نشاط محلك"
      className={
        'glass-pill relative inline-flex h-12 items-center rounded-full p-1 ' + className
      }
    >
      {label && (
        <span className="me-1 hidden h-6 items-center border-e border-white/40 pe-3 ps-3 text-xs font-bold text-white sm:flex">
          {label}
        </span>
      )}
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
              'relative z-10 flex h-full items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors ' +
              (active ? 'text-[#00573f]' : 'text-white hover:bg-white/15')
            }
          >
            {active && (
              <motion.span
                layoutId="vertical-switch-pill"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_6px_18px_-6px] shadow-[#00402c]/60"
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
