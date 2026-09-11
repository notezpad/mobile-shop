'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { ConfirmDialogProvider } from '@/components/shop/ConfirmDialogProvider'
import { ScaleWrapper } from '@/components/ScaleWrapper'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {/*
        ScaleWrapper shrinks the entire page as one unit on small viewports
        (small laptops, high browser-zoom levels).  It uses a JS pixel-based
        two-container approach — NOT CSS zoom — so h-screen / fixed elements
        stay consistent.  No-op on large screens (scale === 1 → pure fragment).
      */}
      <ScaleWrapper>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </ScaleWrapper>
    </NextThemesProvider>
  )
}
