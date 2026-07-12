import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package,
  Search,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Boxes,
  Plus,
  ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { BranchSelect } from '@components/data/BranchSelect';
import { CategorySelect } from '@components/data/CategorySelect';
import { useStockLevels, useStockSummary } from '../hooks/useInventory';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate } from '@core/utils/date';
import type { StockLevel } from '../hooks/useInventory';

export default function InventoryListPage() {
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showLowStock, setShowLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: summary } = useStockSummary(branchId ?? undefined);

  const { data, isLoading, isFetching } = useStockLevels({
    page,
    pageSize,
    branchId: branchId ?? undefined,
    categoryId: categoryId ?? undefined,
    lowStock: showLowStock ? 'true' : undefined,
    sortBy: 'updatedAt',
    sortDir: 'desc',
  });

  // Client-side search filter (since the view doesn't support ILIKE on product_name)
  const filteredItems = (data?.items ?? []).filter(
    (s) =>
      !search ||
      s.product_name.toLowerCase().includes(search.toLowerCase()) ||
      s.product_sku.toLowerCase().includes(search.toLowerCase()) ||
      (s.product_barcode ?? '').includes(search),
  );

  return (
    <div className="page-container">
      <PageHeader
        title="المخزون"
        description="إدارة مستويات المخزون والتقييم"
        actions={
          <>
            <RequirePermission permission="inventory.transfer">
              <Button asChild variant="outline">
                <Link to="/inventory/transfers">
                  <ArrowRightLeft className="size-4" />
                  <span>التحويلات</span>
                </Link>
              </Button>
            </RequirePermission>
            <RequirePermission permission="inventory.stocktake">
              <Button asChild>
                <Link to="/inventory/stocktake">
                  <Plus className="size-4" />
                  <span>جرد جديد</span>
                </Link>
              </Button>
            </RequirePermission>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="إجمالي المنتجات"
          value={formatNumber(summary?.totalProducts ?? 0, 0)}
          icon={<Package className="size-5" />}
        />
        <KpiCard
          label="إجمالي الوحدات"
          value={formatNumber(summary?.totalUnits ?? 0, 0)}
          icon={<Boxes className="size-5" />}
        />
        <KpiCard
          label="قيمة المخزون (تكلفة)"
          value={formatCurrency(summary?.totalValueCost ?? 0)}
          icon={<DollarSign className="size-5" />}
        />
        <KpiCard
          label="مخزون منخفض"
          value={formatNumber(summary?.lowStockCount ?? 0, 0)}
          icon={<AlertTriangle className="size-5" />}
          variant={summary && summary.lowStockCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم، SKU، باركود…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <BranchSelect
              value={branchId}
              onChange={(v) => setBranchId(v)}
              placeholder="كل الفروع"
            />
            <CategorySelect
              value={categoryId}
              onChange={(v) => setCategoryId(v)}
              placeholder="كل الفئات"
            />
            <Button
              variant={showLowStock ? 'warning' : 'outline'}
              onClick={() => setShowLowStock((v) => !v)}
            >
              <AlertTriangle className="size-4" />
              <span>{showLowStock ? 'إخفاء المنخفض' : 'المخزون المنخفض'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title="لا توجد أصناف في المخزون"
              description="سيظهر المخزون هنا عند إضافة منتجات وبيع/شراء أصناف"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">SKU</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المتوفر</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المحجوز</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الإجمالي</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">قيمة التكلفة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">آخر تحديث</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((s: StockLevel) => (
                    <tr key={s.stock_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link to={`/catalog/products/${s.product_id}`} className="font-medium hover:underline">
                          {s.product_name}
                        </Link>
                        {s.category_name ? (
                          <p className="text-xs text-muted-foreground">{s.category_name}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{s.product_sku}</td>
                      <td className="px-4 py-3 font-bold tabular-nums">
                        {formatNumber(s.available_quantity, 0)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatNumber(s.reserved_quantity, 0)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatNumber(s.quantity, 0)}</td>
                      <td className="px-4 py-3 tabular-nums text-xs">{formatCurrency(s.stock_value_cost)}</td>
                      <td className="px-4 py-3">
                        {s.is_low_stock ? (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertTriangle className="size-2.5" />
                            منخفض
                          </Badge>
                        ) : s.available_quantity <= 0 ? (
                          <Badge variant="outline" className="text-[10px]">نفد</Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">متوفر</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(s.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right">الإجمالي:</td>
                    <td className="px-4 py-2 tabular-nums">
                      {formatNumber(filteredItems.reduce((s, r) => s + r.quantity, 0), 0)}
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {formatCurrency(filteredItems.reduce((s, r) => s + r.stock_value_cost, 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            صفحة {page} من {data.totalPages} ({data.total} صنف)
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

      {void useQuery}
      {void TrendingUp}
      {void toast}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  variant = 'default',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant?: 'default' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div
            className={`flex size-9 items-center justify-center rounded-md ${
              variant === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
            }`}
          >
            {icon}
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
