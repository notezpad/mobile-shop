'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProductAvatarProps {
  name: string
  imagePath?: string | null
  size?: 'sm' | 'md'
  className?: string
}

export function ProductAvatar({ name, imagePath, size = 'md', className }: ProductAvatarProps) {
  const [imgError, setImgError] = React.useState(false)
  const dim = size === 'sm' ? 40 : 48

  if (imagePath && !imgError) {
    return (
      <div
        className={cn('shrink-0 overflow-hidden rounded-lg border border-border bg-muted', className)}
        style={{ width: dim, height: dim }}
      >
        <img src={imagePath} alt={name} className="h-full w-full object-cover" onError={() => setImgError(true)} />
      </div>
    )
  }

  const iconSize = size === 'sm' ? 16 : 20

  return (
    <div
      className={cn('shrink-0 flex items-center justify-center rounded-lg', className)}
      style={{
        width: dim, height: dim,
        background: 'linear-gradient(145deg, #f1f5f9 0%, #e2e8f0 100%)',
        border: '1.5px solid #cbd5e1',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6.5L10 3l7 3.5v7L10 17 3 13.5V6.5Z" fill="#94a3b8" />
        <path d="M10 3l7 3.5-7 3.5-7-3.5L10 3Z" fill="#cbd5e1" />
        <path d="M10 10v7l7-3.5V6.5L10 10Z" fill="#7c8fa3" />
        <line x1="10" y1="3" x2="10" y2="10" stroke="#e2e8f0" strokeWidth="0.8" />
      </svg>
    </div>
  )
}
