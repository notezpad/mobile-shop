'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBarcodeDetector } from '@/hooks/use-barcode-detector'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCode: (code: string) => void
}

/** Live camera preview + barcode detection. Closes itself after the first code. Only offered where BarcodeDetector exists. */
export function CameraScanDialog({ open, onOpenChange, onCode }: Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const { start, stop, error, scanning } = useBarcodeDetector({
    previewRef: videoRef,
    onDetect: (code) => {
      onOpenChange(false)
      onCode(code)
    },
  })

  React.useEffect(() => {
    if (!open) {
      stop()
      return
    }
    // Wait a tick so the <video> inside the portal is mounted before the hook attaches the stream.
    const t = setTimeout(() => void start(), 50)
    return () => {
      clearTimeout(t)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>مسح الباركود بالكاميرا</DialogTitle>
          <DialogDescription>وجّه الكاميرا ناحية الباركود.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="size-full object-cover" autoPlay playsInline muted />
          {scanning && <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 motion-safe:animate-pulse" />}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
