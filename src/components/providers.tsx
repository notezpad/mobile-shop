'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { ConfirmDialogProvider } from '@/components/shop/ConfirmDialogProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
    </NextThemesProvider>
  )
}
