'use client'

import * as React from 'react'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DAY_NAMES, hrSend, money } from './hr-ui'

interface Row { name: string; baseSalary: number; jobTitle?: string; phone?: string; weeklyOffDay?: number; hireDate?: string }

const HEADERS = ['الاسم', 'الراتب', 'الوظيفة', 'الموبايل', 'يوم الإجازة', 'تاريخ التعيين']

const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

function toDateStr(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') { // سيريال إكسل
    const d = new Date(Math.round((v - 25569) * 86400_000))
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
  }
  const s = digits(String(v)).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined
}

export function EmployeeImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = React.useState<Row[]>([])
  const [errors, setErrors] = React.useState<string[]>([])
  const [fileName, setFileName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const template = async () => {
    const XLSX = await import('xlsx-js-style')
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ['أحمد محمد', 5000, 'كاشير', '01012345678', 'الجمعة', '2026-01-01']])
    ws['!cols'] = HEADERS.map(() => ({ wch: 16 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'الموظفين')
    XLSX.writeFile(wb, 'قالب-الموظفين.xlsx')
  }

  const onFile = async (file: File) => {
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx-js-style')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const out: Row[] = []
      const errs: string[] = []
      data.forEach((r, i) => {
        const name = String(r['الاسم'] ?? '').trim()
        if (!name && !r['الراتب']) return
        const salary = Number(digits(String(r['الراتب'] ?? '')).replace(/[, ]/g, ''))
        if (!name) return void errs.push(`سطر ${i + 2}: الاسم فاضي`)
        if (!Number.isFinite(salary) || salary < 0 || r['الراتب'] === '') return void errs.push(`سطر ${i + 2} (${name}): الراتب غير صالح`)
        const dayRaw = String(r['يوم الإجازة'] ?? '').trim()
        const dayIdx = dayRaw ? DAY_NAMES.findIndex((d) => d === dayRaw || d.replace('ال', '') === dayRaw.replace('ال', '')) : -1
        out.push({
          name, baseSalary: salary,
          jobTitle: String(r['الوظيفة'] ?? '').trim() || undefined,
          phone: digits(String(r['الموبايل'] ?? '')).trim() || undefined,
          weeklyOffDay: dayIdx >= 0 ? dayIdx : undefined,
          hireDate: toDateStr(r['تاريخ التعيين']),
        })
      })
      if (out.length > 300) errs.push('الملف أكبر من 300 موظف — قسّمه على ملفين')
      setRows(out.slice(0, 300)); setErrors(errs)
      if (out.length === 0 && errs.length === 0) toast.error('مفيش بيانات — تأكد إن العناوين زي القالب')
    } catch {
      setRows([]); setErrors(['تعذّر قراءة الملف — استخدم ملف Excel (xlsx)'])
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      const r = await hrSend<{ inserted: number; skipped: string[] }>('/api/hr/employees/import', 'POST', { rows })
      toast.success(`تمت إضافة ${r.inserted} موظف${r.skipped.length ? ` · تخطّى ${r.skipped.length} مكرر` : ''}`)
      onDone()
    } catch (e: any) { toast.error(e?.message || 'فشل الاستيراد') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-6 sm:px-6 sm:pt-5">
          <DialogTitle>استيراد موظفين من Excel</DialogTitle>
          <DialogDescription>نزّل القالب، املاه، وارفعه. الأسماء الموجودة بالفعل بتتخطى.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 py-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={template} className="gap-1.5"><Download className="size-4" />تحميل القالب</Button>
            <Button variant="outline" onClick={() => inputRef.current?.click()} className="gap-1.5"><FileSpreadsheet className="size-4" />{fileName || 'اختر ملف'}</Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
          {errors.length > 0 && (
            <ul className="space-y-0.5 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700">
              {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
              {errors.length > 8 && <li>… و{errors.length - 8} أخطاء أخرى</li>}
            </ul>
          )}
          {rows.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <p className="bg-muted/50 px-3 py-1.5 text-sm font-bold">{rows.length} موظف جاهز للإضافة</p>
              <ul className="max-h-56 divide-y overflow-y-auto text-sm">
                {rows.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="truncate">{r.name}{r.jobTitle ? ` · ${r.jobTitle}` : ''}</span>
                    <span className="shrink-0 tabular-nums">{money(r.baseSalary)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button onClick={submit} disabled={busy || rows.length === 0} className="gap-1.5">
            {busy && <Loader2 className="size-4 animate-spin" />}إضافة {rows.length || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
