'use client'

import { Crown, Shield, User } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * RoleBadge — WorkerOS-style role pill.
 *
 * Shows the current user's role as a pill-shaped badge with an icon:
 *   - SUPER_ADMIN → amber gradient + crown → "مالك"
 *   - ADMIN       → blue gradient + shield → "مدير"
 *   - EMPLOYEE    → gray gradient + user   → "موظف"
 *
 * Designed to match WorkerOS's "مميز" badge style:
 *   - pill shape (rounded-full)
 *   - gradient background
 *   - white icon + white bold text
 *   - small + compact (fits in header)
 */

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE'

const ROLE_META: Record<Role, {
  label: string
  icon: React.ElementType
  className: string
}> = {
  SUPER_ADMIN: {
    label: 'مالك',
    icon: Crown,
    className: 'role-badge-owner',
  },
  ADMIN: {
    label: 'مدير',
    icon: Shield,
    className: 'role-badge-admin',
  },
  EMPLOYEE: {
    label: 'موظف',
    icon: User,
    className: 'role-badge-employee',
  },
}

export function RoleBadge({ role }: { role: Role | undefined | null }) {
  if (!role) return null

  const meta = ROLE_META[role]
  if (!meta) return null

  const Icon = meta.icon

  return (
    <span className={cn('role-badge', meta.className)}>
      <Icon className="size-3.5" />
      <span>{meta.label}</span>
    </span>
  )
}
