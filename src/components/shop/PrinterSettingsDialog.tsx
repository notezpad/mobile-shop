'use client'

import * as React from 'react'
import { Printer, Usb, Monitor, Network, Check, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PRINTER_SETTINGS,
  getStoredPrinterSettings,
  savePrinterSettings,
  isWebUsbSupported,
  connectUsbPrinter,
  type PrinterSettings,
  type PrinterWidth,
  type PrinterConnection,
} from '@/lib/thermal-printer'
import { Field, Led, SettingRow, Toggle, INK_BTN, INK_BTN_OUTLINE, INK_FIELD } from './settings-ui'

/**
 * PrinterSettingsDialog — thermal printer configuration (بهوية «غرفة التحكم»).
 *
 * Lets the user:
 *  - Choose paper width (58mm / 80mm)
 *  - Choose connection method (USB / Network / Browser)
 *  - Configure IP/port for network printers
 *  - Set encoding, auto-cut, footer text
 *  - Test the USB connection
 *
 * Settings are saved to localStorage so they persist across sessions.
 * (المنطق كله زي ما هو — اتغيّر الشكل بس.)
 */

/** اختيار واحد من كذا اختيار — بديل أوضح من القوائم المنسدلة للاختيارات القليلة */
function Choice({
  active,
  onClick,
  icon: Icon,
  title,
  sub,
  mono,
}: {
  active: boolean
  onClick: () => void
  icon?: LucideIcon
  title: string
  sub?: string
  mono?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center outline-none transition-colors',
        'focus-visible:ring-[3px] focus-visible:ring-foreground/20',
        active
          ? 'border-foreground bg-foreground text-background shadow-sm'
          : 'border-foreground/15 bg-muted/40 text-foreground hover:border-foreground/40'
      )}
    >
      {Icon && <Icon className="size-5" />}
      <span dir={mono ? 'ltr' : undefined} className={cn('text-sm font-extrabold leading-tight', mono && 'font-mono')}>
        {title}
      </span>
      {sub && <span className={cn('text-[10px] font-medium leading-tight', active ? 'text-background/70' : 'text-muted-foreground')}>{sub}</span>}
    </button>
  )
}

export function PrinterSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [settings, setSettings] = React.useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS)
  const [connecting, setConnecting] = React.useState(false)
  const [connected, setConnected] = React.useState(false)
  const usbSupported = typeof window !== 'undefined' && isWebUsbSupported()

  React.useEffect(() => {
    if (open) {
      const stored = getStoredPrinterSettings()
      setSettings({ ...DEFAULT_PRINTER_SETTINGS, ...stored })
      setConnected(false)
    }
  }, [open])

  const update = <K extends keyof PrinterSettings>(key: K, value: PrinterSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    savePrinterSettings(settings)
    toast.success('تم حفظ إعدادات الطابعة')
    onOpenChange(false)
  }

  const handleConnectUsb = async () => {
    setConnecting(true)
    try {
      const success = await connectUsbPrinter()
      if (success) {
        setConnected(true)
        toast.success('تم الاتصال بالطابعة الحرارية')
      } else {
        toast.error('فشل الاتصال — تأكد من توصيل الطابعة بمنفذ USB')
      }
    } catch {
      toast.error('فشل الاتصال بالطابعة')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex flex-col gap-0 overflow-hidden rounded-2xl border-foreground/15 p-0 sm:max-w-[500px]"
      >
        {/* ── الهيدر ── */}
        <div className="flex items-start gap-3 border-b border-dashed border-foreground/20 bg-muted/60 px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
            <Printer className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p dir="ltr" className="text-right text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-muted-foreground">
              08 / Hardware
            </p>
            <DialogTitle className="mt-1.5 text-base font-extrabold leading-tight">إعدادات الطابعة الحرارية</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              اضبط إعدادات طابعة ESC/POS للفواتير الحرارية
            </DialogDescription>
          </div>
        </div>

        {/* ── الجسم ── */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {/* عرض الورق */}
          <Field label="عرض الورق">
            <div role="radiogroup" aria-label="عرض الورق" className="flex gap-2">
              <Choice active={settings.width === '58mm'} onClick={() => update('width', '58mm' as PrinterWidth)} title="58mm" sub="حراري صغير" mono />
              <Choice active={settings.width === '80mm'} onClick={() => update('width', '80mm' as PrinterWidth)} title="80mm" sub="حراري عادي" mono />
            </div>
          </Field>

          {/* طريقة الاتصال */}
          <Field label="طريقة الاتصال">
            <div role="radiogroup" aria-label="طريقة الاتصال" className="flex gap-2">
              <Choice active={settings.connection === 'browser'} onClick={() => update('connection', 'browser' as PrinterConnection)} icon={Monitor} title="المتصفح" sub="نافذة طباعة" />
              {usbSupported && (
                <Choice active={settings.connection === 'usb'} onClick={() => update('connection', 'usb' as PrinterConnection)} icon={Usb} title="USB مباشر" sub="WebUSB" />
              )}
              <Choice active={settings.connection === 'network'} onClick={() => update('connection', 'network' as PrinterConnection)} icon={Network} title="شبكة" sub="IP / Port" />
            </div>
          </Field>

          {/* USB */}
          {settings.connection === 'usb' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-foreground/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Led tone={connected ? 'on' : 'idle'} pulse={connecting} />
                <div>
                  <p className="text-sm font-extrabold leading-tight">{connected ? 'متصل' : 'غير متصل'}</p>
                  <p className="text-xs text-muted-foreground">اضغط زر الاتصال لتوصيل الطابعة USB</p>
                </div>
              </div>
              <Button
                size="sm"
                variant={connected ? 'outline' : 'default'}
                onClick={handleConnectUsb}
                disabled={connecting || connected}
                className={cn('shrink-0 rounded-lg', connected ? INK_BTN_OUTLINE : INK_BTN)}
              >
                {connecting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    جارٍ الاتصال...
                  </>
                ) : connected ? (
                  <>
                    <Check className="size-3.5" />
                    متصل
                  </>
                ) : (
                  'اتصال'
                )}
              </Button>
            </div>
          )}

          {/* الشبكة */}
          {settings.connection === 'network' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="عنوان IP">
                <Input
                  value={settings.ip ?? ''}
                  onChange={(e) => update('ip', e.target.value)}
                  placeholder="192.168.1.100"
                  dir="ltr"
                  className={cn(INK_FIELD, 'text-right font-mono')}
                />
              </Field>
              <Field label="المنفذ">
                <Input
                  type="number"
                  value={settings.port ?? 9100}
                  onChange={(e) => update('port', parseInt(e.target.value) || 9100)}
                  dir="ltr"
                  className={cn(INK_FIELD, 'text-right font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none')}
                />
              </Field>
            </div>
          )}

          {/* الترميز */}
          <Field label="ترميز النص العربي">
            <Select value={settings.encoding} onValueChange={(v) => update('encoding', v as PrinterSettings['encoding'])}>
              <SelectTrigger className={cn(INK_FIELD, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="windows-1256">Windows-1256 (موصى به)</SelectItem>
                <SelectItem value="cp720">CP720 (عربي قديم)</SelectItem>
                <SelectItem value="cp864">CP864 (ISO Arabic)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* القطع التلقائي */}
          <SettingRow title="قطع الورق تلقائياً بعد الطباعة" on={settings.autoCut}>
            <Toggle label="قطع الورق تلقائياً بعد الطباعة" checked={settings.autoCut} onChange={(v) => update('autoCut', v)} />
          </SettingRow>

          {/* نص أسفل الفاتورة */}
          <Field label="نص أسفل الفاتورة">
            <Input
              value={settings.footerText}
              onChange={(e) => update('footerText', e.target.value)}
              placeholder="شكراً لتعاملكم معنا"
              className={INK_FIELD}
            />
          </Field>
        </div>

        {/* ── الأزرار ── */}
        <div className="flex justify-end gap-2 border-t border-dashed border-foreground/20 bg-muted/40 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className={cn('rounded-xl', INK_BTN_OUTLINE)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} className={cn('rounded-xl font-bold', INK_BTN)}>
            <Check className="size-4" />
            حفظ الإعدادات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
