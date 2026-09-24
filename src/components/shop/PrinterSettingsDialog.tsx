'use client'

import * as React from 'react'
import { Printer, Settings, Usb, Monitor, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
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

/**
 * PrinterSettingsDialog — thermal printer configuration.
 *
 * Lets the user:
 *  - Choose paper width (58mm / 80mm)
 *  - Choose connection method (USB / Network / Browser)
 *  - Configure IP/port for network printers
 *  - Set encoding, auto-cut, footer text
 *  - Test the USB connection
 *
 * Settings are saved to localStorage so they persist across sessions.
 */
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            إعدادات الطابعة الحرارية
          </DialogTitle>
          <DialogDescription>
            اضبط إعدادات طابعة ESC/POS للفواتير الحرارية
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Paper width */}
          <div className="space-y-1.5">
            <Label>عرض الورق</Label>
            <Select
              value={settings.width}
              onValueChange={(v: PrinterWidth) => update('width', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58mm (حراري صغير)</SelectItem>
                <SelectItem value="80mm">80mm (حراري عادي)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Connection method */}
          <div className="space-y-1.5">
            <Label>طريقة الاتصال</Label>
            <Select
              value={settings.connection}
              onValueChange={(v: PrinterConnection) => update('connection', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="browser">
                  <div className="flex items-center gap-2">
                    <Monitor className="size-4" />
                    متصفح (نافذة طباعة)
                  </div>
                </SelectItem>
                {isWebUsbSupported() && (
                  <SelectItem value="usb">
                    <div className="flex items-center gap-2">
                      <Usb className="size-4" />
                      USB مباشر (WebUSB)
                    </div>
                  </SelectItem>
                )}
                <SelectItem value="network">
                  <div className="flex items-center gap-2">
                    <Settings className="size-4" />
                    شبكة (IP/Port)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* USB connect button */}
          {settings.connection === 'usb' && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Usb className={`size-5 ${connected ? 'text-success' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">
                      {connected ? 'متصل' : 'غير متصل'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      اضغط زر الاتصال لتوصيل الطابعة USB
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={connected ? 'outline' : 'default'}
                  onClick={handleConnectUsb}
                  disabled={connecting || connected}
                >
                  {connecting ? (
                    'جارٍ الاتصال...'
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
              {!isWebUsbSupported() && (
                <p className="mt-2 text-xs text-amber-600">
                  ⚠️ WebUSB متاح فقط على Chrome/Edge على الديسكتوب
                </p>
              )}
            </div>
          )}

          {/* Network settings */}
          {settings.connection === 'network' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="printer-ip">عنوان IP</Label>
                <Input
                  id="printer-ip"
                  value={settings.ip ?? ''}
                  onChange={(e) => update('ip', e.target.value)}
                  placeholder="192.168.1.100"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="printer-port">المنفذ</Label>
                <Input
                  id="printer-port"
                  type="number"
                  value={settings.port ?? 9100}
                  onChange={(e) => update('port', parseInt(e.target.value) || 9100)}
                  dir="ltr"
                />
              </div>
            </div>
          )}

          {/* Encoding */}
          <div className="space-y-1.5">
            <Label>ترميز النص العربي</Label>
            <Select
              value={settings.encoding}
              onValueChange={(v) => update('encoding', v as PrinterSettings['encoding'])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="windows-1256">Windows-1256 (موصى به)</SelectItem>
                <SelectItem value="cp720">CP720 (عربي قديم)</SelectItem>
                <SelectItem value="cp864">CP864 (ISO Arabic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auto-cut */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-cut"
              checked={settings.autoCut}
              onChange={(e) => update('autoCut', e.target.checked)}
              className="size-4 rounded border-input"
            />
            <Label htmlFor="auto-cut" className="cursor-pointer">
              قطع الورق تلقائياً بعد الطباعة
            </Label>
          </div>

          {/* Footer text */}
          <div className="space-y-1.5">
            <Label htmlFor="footer-text">نص أسفل الفاتورة</Label>
            <Input
              id="footer-text"
              value={settings.footerText}
              onChange={(e) => update('footerText', e.target.value)}
              placeholder="شكراً لتعاملكم معنا"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave}>
            <Check className="size-4" />
            حفظ الإعدادات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
