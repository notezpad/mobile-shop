'use client'

/**
 * useBarcodeDetector — modern camera-based barcode scanner hook.
 *
 * 🛡️ 2026-09-14: Uses the native BarcodeDetector API when available
 * (Chrome on Android, Edge on desktop). Falls back gracefully on
 * unsupported browsers (Safari, Firefox — they just won't show the
 * camera button, the manual scan input still works).
 *
 * Usage:
 *   const { supported, scanning, start, stop, lastCode } = useBarcodeDetector({
 *     onDetect: (code) => {
 *       // add to cart, search product, etc.
 *     }
 *   })
 *
 * The hook automatically:
 *   - Pauses scanning when the tab is hidden
 *   - Stops the camera on unmount
 *   - Debounces duplicate scans within 1.5s
 *   - Provides visual feedback via `scanning` and `lastCode`
 */

import * as React from 'react'

interface UseBarcodeDetectorOptions {
  onDetect: (code: string) => void
  /** Formats to detect — defaults to common ones used in retail. */
  formats?: string[]
}

interface UseBarcodeDetectorResult {
  /** True if the browser supports the BarcodeDetector API. */
  supported: boolean
  /** True if the camera is currently scanning. */
  scanning: boolean
  /** The last detected code (for showing a toast/preview). */
  lastCode: string | null
  /** Start the camera + scanning loop. */
  start: () => Promise<void>
  /** Stop the camera + scanning loop. */
  stop: () => void
  /** Error message if camera access failed. */
  error: string | null
}

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string; format?: string }>>
}

export function useBarcodeDetector({
  onDetect,
  formats = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
}: UseBarcodeDetectorOptions): UseBarcodeDetectorResult {
  const [supported, setSupported] = React.useState(false)
  const [scanning, setScanning] = React.useState(false)
  const [lastCode, setLastCode] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const detectorInstanceRef = React.useRef<BarcodeDetectorLike | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const lastDetectRef = React.useRef<{ code: string; at: number } | null>(null)
  const onDetectRef = React.useRef(onDetect)
  // 🛡️ 2026-10-19: تحديث الـ ref في effect بدل أثناء الرندر (قاعدة react-hooks/refs)
  React.useEffect(() => { onDetectRef.current = onDetect })

  // 🛡️ 2026-10-19: stopInternal اتنقل فوق الـ effects اللي بتستخدمه (كان متعرّف
  // بعدهم فبيتقرأ قبل تعريفه — قاعدة react-hooks/immutability) — نفس الجسم بالظبط
  const stopInternal = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  // Check support on mount
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      setSupported(false)
      return
    }
    setSupported(true)
  }, [])

  // Stop camera on unmount
  React.useEffect(() => {
    return () => {
      stopInternal()
    }
     
  }, [])

  // Pause when tab is hidden
  React.useEffect(() => {
    const onVis = () => {
      if (document.hidden && scanning) {
        stopInternal()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [scanning])

  const start = React.useCallback(async () => {
    if (!supported) {
      setError('المتصفح لا يدعم ماسح الباركود — استخدم إدخال اليد')
      return
    }
    setError(null)
    try {
      // Create detector if not already
      if (!detectorInstanceRef.current) {
        // @ts-expect-error - BarcodeDetector isn't in TS DOM types yet
        const DetectorCtor = window.BarcodeDetector
        detectorInstanceRef.current = new DetectorCtor({ formats }) as BarcodeDetectorLike
      }

      // Request camera (prefer back camera)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream

      // Need a video element
      if (!videoRef.current) {
        const v = document.createElement('video')
        v.autoplay = true
        v.playsInline = true
        v.muted = true
        document.body.appendChild(v)
        v.style.position = 'fixed'
        v.style.opacity = '0'
        v.style.pointerEvents = 'none'
        v.style.top = '0'
        v.style.left = '0'
        v.style.width = '1px'
        v.style.height = '1px'
        videoRef.current = v
      }
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      setScanning(true)

      // Detection loop
      const tick = async () => {
        if (!videoRef.current || !detectorInstanceRef.current) return
        if (videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        try {
          const codes = await detectorInstanceRef.current.detect(videoRef.current)
          if (codes.length > 0) {
            const code = codes[0].rawValue
            const now = Date.now()
            // Debounce — only fire if it's a different code OR > 1.5s since last
            if (
              code &&
              (!lastDetectRef.current ||
                lastDetectRef.current.code !== code ||
                now - lastDetectRef.current.at > 1500)
            ) {
              lastDetectRef.current = { code, at: now }
              setLastCode(code)
              onDetectRef.current(code)
            }
          }
        } catch {
          // ignore transient detect errors
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e: any) {
      console.error('[useBarcodeDetector] start failed:', e)
      setError('تعذّر الوصول للكاميرا — اسمح بالوصول للمتصفح')
      stopInternal()
    }
  }, [supported, formats])

  const stop = React.useCallback(() => {
    stopInternal()
  }, [])

  return {
    supported,
    scanning,
    lastCode,
    start,
    stop,
    error,
  }
}
