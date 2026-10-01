'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Preview of the invoice exactly as it will print (optional — toggled from the POS menu). */
export function ReceiptPreviewDialog({ html, onClose }: { html: string | null; onClose: () => void }) {
  const frame = React.useRef<HTMLIFrameElement | null>(null)
  return (
    <Dialog open={!!html} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>معاينة الفاتورة</DialogTitle>
          <DialogDescription>راجع الفاتورة قبل الطباعة.</DialogDescription>
        </DialogHeader>
        <iframe ref={frame} title="معاينة الفاتورة" srcDoc={html ?? ''} className="h-[60dvh] w-full rounded-lg border bg-white" />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>إغلاق</Button>
          <Button type="button" onClick={() => frame.current?.contentWindow?.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const KEY = 'pos-receipt-preview-v1'
export const getPreviewPref = (): boolean => {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
export const setPreviewPref = (on: boolean) => {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY) } catch { /* ignore */ }
}
