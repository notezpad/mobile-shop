/**
 * Audit logs page — table with filters (entity, action, date, search).
 */
import { useState } from 'react';
import { Search, History, Filter } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { useAuditLogs } from '../api/audit.api';
import type { AuditLogWithUser } from '@mobile-shop/shared';
import { formatDateTime } from '@core/utils/date';

type ActionMeta = { label: string; variant: 'success' | 'info' | 'destructive' | 'warning' | 'secondary' };
const ACTION_META: Record<string, ActionMeta> = {
  create: { label: 'إنشاء', variant: 'success' },
  update: { label: 'تعديل', variant: 'info' },
  delete: { label: 'حذف', variant: 'destructive' },
  restore: { label: 'استعادة', variant: 'warning' },
  login: { label: 'دخول', variant: 'secondary' },
  logout: { label: 'خروج', variant: 'secondary' },
  export: { label: 'تصدير', variant: 'warning' },
  print: { label: 'طباعة', variant: 'warning' },
};
const DEFAULT_ACTION: ActionMeta = { label: '—', variant: 'secondary' };

const ENTITY_LABELS: Record<string, string> = {
  users: 'مستخدمون', roles: 'أدوار', branches: 'فروع', categories: 'فئات',
  products: 'منتجات', device_units: 'أجهزة', suppliers: 'موردون',
  inventory_stocks: 'مخزون', stock_movements: 'حركات مخزون', stock_transfers: 'تحويلات',
  customers: 'عملاء', sales: 'مبيعات', sale_items: 'أصناف بيع',
  invoices: 'فواتير', returns: 'مرتجعات', repairs: 'صيانة', repair_parts: 'قطع غيار',
  cashboxes: 'خزنة', expenses: 'مصروفات', revenues: 'إيرادات',
  payment_methods: 'وسائل دفع', shifts: 'ورديات', employees: 'موظفون',
  attendance: 'حضور', settings: 'إعدادات', backups: 'نسخ احتياطية', audit_logs: 'سجلات',
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAuditLogs({
    page, pageSize: 25,
    search: search || undefined,
    entity: entityFilter || undefined,
    action: (actionFilter || undefined) as 'create' | 'update' | 'delete' | 'restore' | 'login' | 'logout' | 'export' | 'print' | undefined,
    sortBy: 'createdAt', sortDir: 'desc',
  });

  const logs = data?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader title="سجل التدقيق" description={`${data?.total ?? 0} سجل`} />

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="بحث…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pr-9" />
            </div>
            <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring">
              <option value="">كل الكيانات</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring">
              <option value="">كل الإجراءات</option>
              {Object.entries(ACTION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState /> : logs.length === 0 ? (
        <EmptyState icon={<History />} title="لا سجلات" description="ستظهر سجلات التدقيق هنا" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المستخدم</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الإجراء</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكيان</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log: AuditLogWithUser) => {
                    const meta = ACTION_META[log.action] ?? DEFAULT_ACTION;
                    return (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{log.user_name ?? 'النظام'}</p>
                          {log.user_username ? <p className="text-xs text-muted-foreground font-mono">@{log.user_username}</p> : null}
                        </td>
                        <td className="px-4 py-3"><Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge></td>
                        <td className="px-4 py-3 text-xs">{ENTITY_LABELS[log.entity] ?? log.entity}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-md truncate">
                          {log.after ? JSON.stringify(log.after).slice(0, 100) : log.before ? `قبل: ${JSON.stringify(log.before).slice(0, 80)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data && data.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">صفحة {page} من {data.totalPages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">السابق</button>
                  <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="rounded-md border px-3 py-1 text-sm disabled:opacity-50">التالي</button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
      {void Filter}
    </div>
  );
}
