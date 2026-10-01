'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const SHORTCUTS: [string, string][] = [
  ['F2  أو  /', 'البحث / مسح الباركود'],
  ['F4', 'اختيار العميل'],
  ['F6', 'خصم'],
  ['F8', 'تعليق الفاتورة'],
  ['F9  أو  Ctrl+Enter', 'دفع وطباعة'],
  ['↑ ↓', 'التنقل بين أسطر الفاتورة (والبحث فاضي)'],
  ['+  /  −', 'زيادة / تقليل كمية السطر المحدد'],
  ['Delete', 'حذف السطر المحدد'],
  ['Esc', 'إغلاق القائمة ← مسح البحث ← (مرتين) مسح الفاتورة'],
  ['?  أو  Ctrl+/', 'عرض الاختصارات'],
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>اختصارات لوحة المفاتيح</DialogTitle>
          <DialogDescription>شغالة بأي لغة كيبورد.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y text-sm">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2">
              <dt className="min-w-0 text-muted-foreground">{d}</dt>
              <dd>
                <kbd className="whitespace-nowrap rounded-md border bg-muted px-2 py-0.5 text-xs font-medium" dir="ltr">{k}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
