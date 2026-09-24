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
      {/*
        ScaleWrapper was removed from the global providers because it was
        clipping the landing page (and any page that relies on natural document
        scrolling) on small viewports. Its outer container uses
        `position: fixed; overflow: hidden` with a fixed height equal to the
        viewport, which clips any content taller than the viewport and
        prevents scrolling.

        ScaleWrapper is now applied selectively - only around the authenticated
        app shell (MainApp / SuperAdminApp) inside src/app/page.tsx. Those
        views are designed with an `h-screen` app-shell pattern that fits the
        scaled container exactly, so scaling works without clipping.

        The landing page, auth page, and any other page that uses
        `min-h-screen` with content taller than the viewport now scroll
        naturally as expected.
      */}
      <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
    </NextThemesProvider>
  )
}
