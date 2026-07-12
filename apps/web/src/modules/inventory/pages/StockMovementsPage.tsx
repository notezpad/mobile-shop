import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Filter } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Button, Badge, Input } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { BranchSelect } from '@components/data/BranchSelect';
import { useStockMovements } from '../hooks/useInventory';
import { formatNumber } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';
import type { StockMovementType } from '@mobile-shop/shared';

type TypeMeta = {
  label: string;
  variant: 'success' | 'destructive' | 'info' | 'warning' | 'secondary';
  sign: '+' | '-' | '±';
};

const TYPE_META: Record<string, TypeMeta> = {
  purchase: { label: 'شراء', variant: 'success', sign: '+' },
  sale: { label: 'بيع', variant: 'destructive', sign: '-' },
  return_in: { label: 'مرتجع عميل', variant: 'success', sign: '+' },
  return_out: { label: 'مرتجع مورد', variant: 'warning', sign: '-' },
  transfer_in: { label: 'تحويل وارد', variant: 'info', sign: '+' },
  transfer_out: { label: 'تحويل صادر', variant: 'warning', sign: '-' },
  adjustment: { label: 'تسوية', variant: 'secondary', sign: '±' },
  repair_in: { label: 'إرجاع صيانة', variant: 'success', sign: '+' },
  repair_out: { label: 'صرف صيانة', variant: 'destructive', sign: '-' },
};

const DEFAULT_TYPE_META: TypeMeta = { label: 'غير معروف', variant: 'secondary', sign: '±' };

export default function StockMovementsPage() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const { data, isLoading, isFetching } = useStockMovements({
    page,
    pageSize,
    branchId: branchId ?? undefined,
    type: (typeFilter || undefined) as StockMovementType | undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });

  const movements = data?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title="حركات المخزون"
        description="سجل كامل لكل حركات المخزون (شراء، بيع، تحويل، تسوية)"
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory">
              <ArrowRight className="size-4" />
              <span>العودة للمخزون</span>
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <BranchSelect
              value={branchId}
              onChange={(v) => {
                setBranchId(v);
                setPage(1);
              }}
              placeholder="كل الفروع"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">كل أنواع الحركات</option>
              {Object.entries(TYPE_META).map(([key, m]) => (
                <option key={key} value={key}>
                  {m.label}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              placeholder="من تاريخ"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              placeholder="إلى تاريخ"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : movements.length === 0 ? (
            <EmptyState
              icon={<History />}
              title="لا توجد حركات"
              description="ستظهر حركات المخزون هنا عند بدء البيع والشراء والتحويل"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">النوع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكمية</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الرصيد بعد</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">السبب</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المرجع</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.map((m) => {
                    const meta = TYPE_META[m.type] ?? DEFAULT_TYPE_META;
                    return (
                      <tr key={m.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(m.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={meta.variant} className="text-[10px]">
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/catalog/products/${m.product_id}`} className="hover:underline">
                            {/* Product name loaded separately if needed; for now show ID prefix */}
                            <span className="font-mono text-xs">{m.product_id.slice(0, 8)}…</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-bold tabular-nums">
                          <span className={m.quantity > 0 ? 'text-success' : m.quantity < 0 ? 'text-destructive' : ''}>
                            {meta.sign === '+' ? '+' : meta.sign === '-' ? '' : '±'}
                            {formatNumber(Math.abs(m.quantity), 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatNumber(m.balance_after, 0)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                          {m.reason ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {m.ref_type ? (
                            <Badge variant="outline" className="text-[10px]">
                              {m.ref_type}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            صفحة {page} من {data.totalPages} ({data.total} حركة)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages || isFetching}
            >
              التالي
            </Button>
          </div>
        </div>
      ) : null}

      {void Filter}
    </div>
  );
}
