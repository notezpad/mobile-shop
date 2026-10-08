'use client'

/**
 * 🔗 UTM Builder — بناء روابط حملات Meta / Google / TikTok + مكتبة حملات.
 * - اقتراح Source/Medium لكل منصة + Dynamic Parameters (Macros).
 * - منع التكرار (urlHash على السيرفر) + تحقق فوري في الواجهة.
 * - ربط مباشر بـ UserAttribution: روابط utm_* يلتقطها نظام التتبع الحالي
 *   ويحفظ First/Last Touch → تظهر الحملات في القمع وتقارير الإسناد.
 */

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Link2, Archive, ArchiveRestore, Pencil, Trash2, Download, Wand2, AlertTriangle } from 'lucide-react'
import {
  buildUtmUrl, getSuggestions, getMacros, toCsv, UtmPlatform,
} from '@/lib/tracking/utm'
import { fetchJson, fmtNum, fmtMoney, CopyButton, EmptyHint } from './shared'

interface CampaignRow {
  id: number
  name: string
  platform: string
  destinationUrl: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
  utmId: string | null
  fullUrl: string
  archived: boolean
  createdAt: string
}

interface LibraryData {
  campaigns: CampaignRow[]
  performance: Record<string, { registrations: number; purchases: number; revenue: number }>
  tablesReady: boolean
}

const PLATFORMS: { key: UtmPlatform; label: string }[] = [
  { key: 'meta', label: 'Meta (Facebook / Instagram)' },
  { key: 'google', label: 'Google Ads' },
  { key: 'tiktok', label: 'TikTok Ads' },
  { key: 'custom', label: 'مخصص' },
]

/** شرائح الماكروز — خارج المكوّن لتفادي إعادة الإنشاء عند كل render */
function MacroChips({ platform, onApply }: { platform: string; onApply: (target: 'content' | 'term' | 'campaign' | 'utmId' | 'source', macro: string) => void }) {
  const items = getMacros(platform)
  if (!items.length) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((m) => (
        <button
          key={m.macro} type="button" onClick={() => onApply(m.target, m.macro)}
          className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          title={`إضافة: ${m.label}`}
          dir="ltr"
        >
          + {m.macro}
        </button>
      ))}
    </div>
  )
}

const PLATFORM_BADGE: Record<string, string> = {
  meta: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  google: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  tiktok: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  custom: 'bg-muted text-muted-foreground',
}

const emptyForm = {
  name: '', platform: 'meta' as UtmPlatform, destinationUrl: '',
  source: '', medium: '', campaign: '', content: '', term: '', utmId: '',
}

export function UtmBuilder() {
  // ─── الباني ───
  const [form, setForm] = React.useState({ ...emptyForm })
  const [touchedSM, setTouchedSM] = React.useState(false) // هل عدّل المستخدم source/medium يدوياً؟
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)

  // ─── المكتبة ───
  const [lib, setLib] = React.useState<LibraryData | null>(null)
  const [loadingLib, setLoadingLib] = React.useState(true)
  const [q, setQ] = React.useState('')
  const [libPlatform, setLibPlatform] = React.useState('all')
  const [showArchived, setShowArchived] = React.useState(false)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  // تغيير المنصة → اقتراح source/medium (إن لم يكتبهما المستخدم)
  const changePlatform = (p: UtmPlatform) => {
    const sug = getSuggestions(p)
    setForm((f) => ({
      ...f,
      platform: p,
      source: touchedSM ? f.source : sug.sources[0] ?? '',
      medium: touchedSM ? f.medium : sug.mediums[0] ?? '',
    }))
  }

  // معاينة حية
  const preview = React.useMemo(
    () => buildUtmUrl({
      destinationUrl: form.destinationUrl, platform: form.platform,
      campaign: form.campaign, content: form.content, term: form.term,
      utmId: form.utmId, source: form.source || undefined, medium: form.medium || undefined,
    }),
    [form]
  )

  // ─── تحميل المكتبة ───
  const loadLib = React.useCallback(async () => {
    setLoadingLib(true)
    try {
      const p = new URLSearchParams()
      if (q.trim()) p.set('q', q.trim())
      if (libPlatform !== 'all') p.set('platform', libPlatform)
      if (showArchived) p.set('archived', '1')
      setLib(await fetchJson<LibraryData>(`/api/admin/tracking/utm?${p.toString()}`))
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل مكتبة الحملات')
    } finally {
      setLoadingLib(false)
    }
  }, [q, libPlatform, showArchived])

  React.useEffect(() => {
    const t = setTimeout(() => void Promise.resolve().then(loadLib), 250)
    return () => clearTimeout(t)
  }, [loadLib])

  // ─── حفظ (إنشاء/تعديل) ───
  const save = async () => {
    if (!preview.ok) {
      toast.error(preview.errors[0])
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name, platform: form.platform, destinationUrl: form.destinationUrl,
        source: form.source, medium: form.medium, campaign: form.campaign,
        content: form.content, term: form.term, utmId: form.utmId,
      }
      if (editingId) {
        await fetchJson(`/api/admin/tracking/utm/${editingId}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
        toast.success('تم تحديث الحملة')
      } else {
        await fetchJson('/api/admin/tracking/utm', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
        toast.success('تم حفظ الحملة في المكتبة')
      }
      preview.warnings.forEach((w) => toast.warning(w))
      setForm({ ...emptyForm })
      setTouchedSM(false)
      setEditingId(null)
      void loadLib()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (c: CampaignRow) => {
    setEditingId(c.id)
    setForm({
      name: c.name, platform: (c.platform as UtmPlatform) || 'custom', destinationUrl: c.destinationUrl,
      source: c.utmSource, medium: c.utmMedium, campaign: c.utmCampaign,
      content: c.utmContent ?? '', term: c.utmTerm ?? '', utmId: c.utmId ?? '',
    })
    setTouchedSM(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleArchive = async (c: CampaignRow) => {
    try {
      await fetchJson(`/api/admin/tracking/utm/${c.id}`, { method: 'PUT', body: JSON.stringify({ archived: !c.archived }), headers: { 'Content-Type': 'application/json' } })
      toast.success(c.archived ? 'تمت الاستعادة' : 'تمت الأرشفة')
      void loadLib()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التنفيذ')
    }
  }

  const remove = async (c: CampaignRow) => {
    if (!window.confirm(`حذف حملة "${c.name}" نهائياً؟`)) return
    try {
      await fetchJson(`/api/admin/tracking/utm/${c.id}`, { method: 'DELETE' })
      toast.success('تم الحذف')
      void loadLib()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    }
  }

  const exportCsv = () => {
    if (!lib?.campaigns.length) return
    const csv = toCsv(
      lib.campaigns.map((c) => ({
        name: c.name, platform: c.platform, destination: c.destinationUrl,
        utm_source: c.utmSource, utm_medium: c.utmMedium, utm_campaign: c.utmCampaign,
        utm_content: c.utmContent ?? '', utm_term: c.utmTerm ?? '', utm_id: c.utmId ?? '',
        url: c.fullUrl, created: new Date(c.createdAt).toLocaleDateString('ar-EG'),
      })),
      [
        { key: 'name', label: 'الحملة' }, { key: 'platform', label: 'المنصة' },
        { key: 'destination', label: 'الرابط الأساسي' },
        { key: 'utm_source', label: 'utm_source' }, { key: 'utm_medium', label: 'utm_medium' },
        { key: 'utm_campaign', label: 'utm_campaign' }, { key: 'utm_content', label: 'utm_content' },
        { key: 'utm_term', label: 'utm_term' }, { key: 'utm_id', label: 'utm_id' },
        { key: 'url', label: 'الرابط الكامل' }, { key: 'created', label: 'التاريخ' },
      ]
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nezam-utm-campaigns-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const macros = getMacros(form.platform)
  const macroApply = (target: 'content' | 'term' | 'campaign' | 'utmId' | 'source', macro: string) => {
    const cur = (form as any)[target] as string
    set({ [target]: cur ? `${cur}_${macro}` : macro } as any)
  }

  return (
    <div className="space-y-4">
      {/* ─── الباني ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="size-4 text-primary" />
            {editingId ? 'تعديل حملة' : 'بناء رابط حملة جديد'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">اسم الحملة (داخلي)</Label>
              <Input className="h-9 text-sm" placeholder="مثال: رمضان 2026 — مشاهير" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المنصة</Label>
              <Select value={form.platform} onValueChange={(v) => changePlatform(v as UtmPlatform)}>
                <SelectTrigger className="h-9 text-sm" dir="rtl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">الرابط الأساسي (Canonical — بدون UTM)</Label>
            <Input className="h-9 text-sm" dir="ltr" placeholder="https://nezampos.com/register" value={form.destinationUrl} onChange={(e) => set({ destinationUrl: e.target.value })} />
            <p className="text-[10px] text-muted-foreground">أي معاملات utm_* موجودة في الرابط ستُحذف تلقائياً للحفاظ على Canonical نظيف.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">utm_source</Label>
              <Input className="h-9 text-sm" dir="ltr" value={form.source} onChange={(e) => { set({ source: e.target.value }); setTouchedSM(true) }} placeholder={getSuggestions(form.platform).sources[0]} />
              <MacroChips platform={form.platform} onApply={macroApply} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">utm_medium</Label>
              <Input className="h-9 text-sm" dir="ltr" value={form.medium} onChange={(e) => { set({ medium: e.target.value }); setTouchedSM(true) }} placeholder={getSuggestions(form.platform).mediums[0]} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">utm_campaign *</Label>
              <Input className="h-9 text-sm" dir="ltr" value={form.campaign} onChange={(e) => set({ campaign: e.target.value })} placeholder="spring_sale" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">utm_content (اختياري)</Label>
              <Input className="h-9 text-sm" dir="ltr" value={form.content} onChange={(e) => set({ content: e.target.value })} placeholder="video_a" />
              <MacroChips platform={form.platform} onApply={macroApply} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">utm_term (اختياري)</Label>
              <Input className="h-9 text-sm" dir="ltr" value={form.term} onChange={(e) => set({ term: e.target.value })} placeholder="pos+erp" />
              <MacroChips platform={form.platform} onApply={macroApply} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">utm_id (اختياري)</Label>
              <Input className="h-9 text-sm" dir="ltr" value={form.utmId} onChange={(e) => set({ utmId: e.target.value })} placeholder="12345" />
              <MacroChips platform={form.platform} onApply={macroApply} />
            </div>
          </div>

          {/* المعاينة */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">معاينة الرابط</span>
              {preview.ok && <CopyButton text={preview.fullUrl} label="نسخ الرابط" />}
            </div>
            {preview.errors.length > 0 ? (
              <div className="space-y-1">
                {preview.errors.map((er) => (
                  <p key={er} className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="size-3" /> {er}</p>
                ))}
              </div>
            ) : (
              <p className="break-all font-mono text-[11px] leading-relaxed text-foreground" dir="ltr">{preview.fullUrl}</p>
            )}
            {preview.warnings.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {preview.warnings.map((w) => <p key={w} className="text-[11px] text-amber-600 dark:text-amber-400">⚠ {w}</p>)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || !preview.ok} className="h-9">
              {saving ? 'جارٍ الحفظ…' : editingId ? 'حفظ التعديلات' : 'حفظ في المكتبة'}
            </Button>
            {editingId && (
              <Button variant="ghost" onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setTouchedSM(false) }} className="h-9">
                إلغاء
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── المكتبة ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2"><Link2 className="size-4 text-primary" /> مكتبة الحملات</span>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv} disabled={!lib?.campaigns.length}>
              <Download className="size-3.5" /> CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lib && lib.tablesReady === false && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
              جدول مكتبة الحملات غير مُهيأ — شغّل ملف <code className="rounded bg-muted px-1 font-mono" dir="ltr">TRACKING_TABLES.sql</code> في Supabase SQL Editor ثم أعد التحميل.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-8 w-[200px] text-xs" placeholder="بحث بالاسم/الحملة/الرابط…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={libPlatform} onValueChange={setLibPlatform}>
              <SelectTrigger className="h-8 w-[130px] text-xs" dir="rtl"><SelectValue placeholder="المنصة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المنصات</SelectItem>
                {PLATFORMS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border bg-background p-0.5">
              <button
                onClick={() => setShowArchived(false)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${!showArchived ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                النشطة
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${showArchived ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                <Archive className="ms-0.5 inline size-3" /> المؤرشفة
              </button>
            </div>
          </div>

          {loadingLib && !lib ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !lib || lib.campaigns.length === 0 ? (
            <EmptyHint>
              {showArchived ? 'لا توجد حملات مؤرشفة.' : 'لا توجد حملات محفوظة بعد — ابنِ أول رابط من الأعلى.'}
              <br />
              <span className="text-xs">روابط utm_* يلتقطها نظام التتبع تلقائياً ويحفظ First/Last Touch لكل زائر — وتظهر النتائج في القمع وتقارير الإسناد.</span>
            </EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الحملة</TableHead>
                    <TableHead>المنصة</TableHead>
                    <TableHead>source / medium</TableHead>
                    <TableHead>أداء 30 يوم</TableHead>
                    <TableHead className="w-[190px]">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lib.campaigns.map((c) => {
                    const perf = lib.performance?.[c.utmCampaign.toLowerCase()]
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-[220px]">
                          <p className="truncate font-medium" title={c.name}>{c.name}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr" title={c.fullUrl}>{c.utmCampaign}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border-0 text-[10px] ${PLATFORM_BADGE[c.platform] ?? ''}`}>{c.platform}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">{c.utmSource} / {c.utmMedium}</TableCell>
                        <TableCell className="text-xs">
                          {perf ? (
                            <span className="tabular-nums">
                              تسجيلات <b>{fmtNum(perf.registrations)}</b> · مدفوعات <b className="text-emerald-600 dark:text-emerald-400">{fmtNum(perf.purchases)}</b> · <b>{fmtMoney(perf.revenue)}</b>
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <CopyButton text={c.fullUrl} size="icon" label="⧉" />
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => startEdit(c)} title="تعديل">
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => toggleArchive(c)} title={c.archived ? 'استعادة' : 'أرشفة'}>
                              {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => remove(c)} title="حذف نهائي">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
