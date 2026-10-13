'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, Trash2, Download, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'

interface Candidate {
  id: string
  shopName: string
  ownerName: string
  email: string
  phone: string
  createdAt: string
  lastLoginAt: string | null
  suspicious: boolean
  reason: string | null
}

const REASONS: Record<string, string> = {
  'disposable-email': 'بريد مؤقت',
  'junk-email': 'بريد وهمي',
  'junk-name': 'اسم وهمي',
  'junk-shop': 'اسم محل وهمي',
  'junk-phone': 'رقم وهمي',
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * 🧹 تنضيف التجارب الوهمية: حسابات تجربة بلا أي منتج أو مبيعات أو دفع.
 * الحذف نهائي + بينزّل ملف «جمهور استبعاد» لفيسبوك (email/phone مهشّمين SHA-256).
 */
export function FakeSignupsDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone?: () => void
}) {
  const [rows, setRows] = React.useState<Candidate[] | null>(null)
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setRows(null)
    setSel(new Set())
    api<{ candidates: Candidate[] }>('/api/admin/tenants/fake-candidates')
      .then((d) => {
        setRows(d.candidates)
        setSel(new Set(d.candidates.filter((c) => c.suspicious).map((c) => c.id)))
      })
      .catch((e) => {
        toast.error(e?.message || 'تعذّر تحميل القائمة')
        setRows([])
      })
  }, [open])

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const purge = async () => {
    if (sel.size === 0) return
    if (!window.confirm(`حذف ${sel.size} حساب نهائياً؟ مفيش رجوع.`)) return
    setBusy(true)
    try {
      const r = await api<{ deleted: number; cancelledOnly: number; skipped: number; audienceCsv: string; audienceRows: number }>(
        '/api/admin/tenants/purge-fake',
        { method: 'POST', body: { ids: Array.from(sel) } },
      )
      if (r.audienceRows > 0) {
        downloadCsv(`meta-exclusion-audience-${new Date().toISOString().slice(0, 10)}.csv`, r.audienceCsv)
      }
      toast.success(
        `اتحذف ${r.deleted}` +
          (r.cancelledOnly ? ` · اتلغى ${r.cancelledOnly} (مش قابل للحذف النهائي)` : '') +
          (r.skipped ? ` · اتخطى ${r.skipped} (عليه نشاط)` : '') +
          (r.audienceRows ? ' — اتنزّل ملف جمهور الاستبعاد' : ''),
      )
      onDone?.()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setBusy(false)
    }
  }

  const suspiciousCount = rows?.filter((r) => r.suspicious).length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-rose-500" />
            تنضيف التجارب الوهمية
          </DialogTitle>
          <DialogDescription>
            حسابات تجربة عدّى عليها يوم وبدون أي منتج أو مبيعات أو دفع. بعد الحذف بينزل ملف جمهور استبعاد لفيسبوك.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {rows === null ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">مفيش حسابات تجربة خاملة دلوقتي 👌</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold">{rows.length} حساب خامل</span>
                <span className="text-muted-foreground">· {suspiciousCount} مشكوك فيه تلقائياً</span>
                <Button size="sm" variant="outline" onClick={() => setSel(new Set(rows.filter((r) => r.suspicious).map((r) => r.id)))}>
                  المشكوك فيهم بس
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSel(new Set(rows.map((r) => r.id)))}>
                  تحديد الكل
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
                  إلغاء التحديد
                </Button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
                {rows.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/50"
                  >
                    <input type="checkbox" className="size-4 accent-rose-600" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold">{r.shopName}</span>
                        {r.suspicious && r.reason && (
                          <Badge variant="destructive" className="text-[10px]">
                            {REASONS[r.reason] ?? 'مشكوك فيه'}
                          </Badge>
                        )}
                      </div>
                      <div dir="ltr" className="truncate text-start text-xs text-muted-foreground">
                        {r.ownerName} · {r.email || '—'} · {r.phone || '—'}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString('ar-EG')}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={purge} disabled={busy || sel.size === 0} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            حذف {sel.size || ''} + تصدير جمهور الاستبعاد
            <Download className="size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
