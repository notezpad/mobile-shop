/**
 * Unified Inventory Page — combines stock levels, movements, and stocktake
 * into a single page with tabs for a simpler user experience.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package,
  Search,
  AlertTriangle,
  DollarSign,
  Boxes,
  Plus,
  ArrowRightLeft,
  History,
  ClipboardCheck,
  Save,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { EmptyState } from '@components/layout/EmptyState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { BranchSelect } from '@components/data/BranchSelect';
import { CategorySelect } from '@components/data/CategorySelect';
import {
  useStockLevels,
  useStockSummary,
  useStockMovements,
} from '../hooks/useInventory';
import { inventoryApi } from '../api/inventory.api';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate, formatDateTime } from '@core/utils/date';
import type { StockLevel } from '../hooks/useInventory';
import type { StockMovementType } from '@mobile-shop/shared';

// ─── Tabs ────────────────────────────────────────────────────────
type TabKey = 'stock' | 'movements' | 'stocktake';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Package }> = [
  { key: 'stock', label: 'المخزون', icon: Warehouse },
  { key: 'movements', label: 'الحركات', icon: History },
  { key: 'stocktake', label: 'الجرد', icon: ClipboardCheck },
];

// ─── Movement type labels ────────────────────────────────────────
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

// ─── Stocktake adjustment row ────────────────────────────────────
interface AdjustmentRow {
  productId: string;
  productName: string;
  sku: string;
  currentQuantity: number;
  countedQuantity: number | null;
  branchId: string;
}

// ═══════════════════════════════════════════════════════════════════
export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('stock');

  return (
    <div className="page-container">
      <PageHeader
        title="المخزون"
        description="إدارة المخزون والحركات والجرد"
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
          </>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <tab.icon className="size-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'stock' && <StockTab />}
      {activeTab === 'movements' && <MovementsTab />}
      {activeTab === 'stocktake' && <StocktakeTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1: Stock Levels
// ═══════════════════════════════════════════════════════════════════
function StockTab() {
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

  const filteredItems = (data?.items ?? []).filter(
    (s) =>
      !search ||
      s.product_name.toLowerCase().includes(search.toLowerCase()) ||
      s.product_sku.toLowerCase().includes(search.toLowerCase()) ||
      (s.product_barcode ?? '').includes(search),
  );

  return (
    <>
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="إجمالي المنتجات" value={formatNumber(summary?.totalProducts ?? 0, 0)} icon={<Package className="size-5" />} />
        <KpiCard label="إجمالي الوحدات" value={formatNumber(summary?.totalUnits ?? 0, 0)} icon={<Boxes className="size-5" />} />
        <KpiCard label="قيمة المخزون (تكلفة)" value={formatCurrency(summary?.totalValueCost ?? 0)} icon={<DollarSign className="size-5" />} />
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
              <Input placeholder="بحث بالاسم، SKU، باركود…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
            </div>
            <BranchSelect value={branchId} onChange={(v) => setBranchId(v)} placeholder="كل الفروع" />
            <CategorySelect value={categoryId} onChange={(v) => setCategoryId(v)} placeholder="كل الفئات" />
            <Button variant={showLowStock ? 'warning' : 'outline'} onClick={() => setShowLowStock((v) => !v)}>
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
            <EmptyState icon={<Package />} title="لا توجد أصناف في المخزون" description="سيظهر المخزون هنا عند إضافة منتجات" />
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredItems.map((s: StockLevel) => (
                    <tr key={s.stock_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link to={`/catalog/products/${s.product_id}`} className="font-medium hover:underline">{s.product_name}</Link>
                        {s.category_name ? <p className="text-xs text-muted-foreground">{s.category_name}</p> : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{s.product_sku}</td>
                      <td className="px-4 py-3 font-bold tabular-nums">{formatNumber(s.available_quantity, 0)}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatNumber(s.reserved_quantity, 0)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatNumber(s.quantity, 0)}</td>
                      <td className="px-4 py-3 tabular-nums text-xs">{formatCurrency(s.stock_value_cost)}</td>
                      <td className="px-4 py-3">
                        {s.is_low_stock ? (
                          <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="size-2.5" /> منخفض</Badge>
                        ) : s.available_quantity <= 0 ? (
                          <Badge variant="outline" className="text-[10px]">نفد</Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">متوفر</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right">الإجمالي:</td>
                    <td className="px-4 py-2 tabular-nums">{formatNumber(filteredItems.reduce((s, r) => s + r.quantity, 0), 0)}</td>
                    <td className="px-4 py-2 tabular-nums">{formatCurrency(filteredItems.reduce((s, r) => s + r.stock_value_cost, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">صفحة {page} من {data.totalPages} ({data.total} صنف)</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || isFetching}>السابق</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages || isFetching}>التالي</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2: Stock Movements
// ═══════════════════════════════════════════════════════════════════
function MovementsTab() {
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
    <>
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <BranchSelect value={branchId} onChange={(v) => { setBranchId(v); setPage(1); }} placeholder="كل الفروع" />
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">كل أنواع الحركات</option>
              {Object.entries(TYPE_META).map(([key, m]) => (
                <option key={key} value={key}>{m.label}</option>
              ))}
            </select>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} placeholder="من تاريخ" />
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} placeholder="إلى تاريخ" />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : movements.length === 0 ? (
            <EmptyState icon={<History />} title="لا توجد حركات" description="ستظهر حركات المخزون هنا عند بدء البيع والشراء" />
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
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                        <td className="px-4 py-3"><Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge></td>
                        <td className="px-4 py-3">
                          <Link to={`/catalog/products/${m.product_id}`} className="hover:underline">
                            <span className="font-mono text-xs">{m.product_id.slice(0, 8)}…</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-bold tabular-nums">
                          <span className={m.quantity > 0 ? 'text-success' : m.quantity < 0 ? 'text-destructive' : ''}>
                            {meta.sign === '+' ? '+' : meta.sign === '-' ? '' : '±'}{formatNumber(Math.abs(m.quantity), 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatNumber(m.balance_after, 0)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{m.reason ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {m.ref_type ? <Badge variant="outline" className="text-[10px]">{m.ref_type}</Badge> : <span className="text-muted-foreground">—</span>}
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
          <p className="text-muted-foreground">صفحة {page} من {data.totalPages} ({data.total} حركة)</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || isFetching}>السابق</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages || isFetching}>التالي</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3: Stocktake (الجرد)
// ═══════════════════════════════════════════════════════════════════
function StocktakeTab() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useStockLevels({
    page: 1,
    pageSize: 100,
    branchId: branchId ?? undefined,
    categoryId: categoryId ?? undefined,
    sortBy: 'product',
    sortDir: 'asc',
  });

  const initializeRows = () => {
    if (!data?.items || !branchId) {
      toast.error('اختر الفرع أولاً');
      return;
    }
    const filtered = data.items.filter(
      (s) =>
        !search ||
        s.product_name.toLowerCase().includes(search.toLowerCase()) ||
        s.product_sku.toLowerCase().includes(search.toLowerCase()),
    );
    setRows(
      filtered.map((s: StockLevel) => ({
        productId: s.product_id,
        productName: s.product_name,
        sku: s.product_sku,
        currentQuantity: s.quantity,
        countedQuantity: null,
        branchId: s.branch_id,
      })),
    );
  };

  const updateCounted = (productId: string, value: string) => {
    const num = value === '' ? null : Number(value);
    setRows((prev) =>
      prev.map((r) => (r.productId === productId ? { ...r, countedQuantity: num } : r)),
    );
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const toSave = rows.filter((r) => r.countedQuantity !== null);
      if (toSave.length === 0) {
        throw new Error('لا توجد أصناف لإجراء التسوية عليها');
      }
      return inventoryApi.recordAdjustments({
        branchId: branchId!,
        adjustments: toSave.map((r) => ({
          productId: r.productId,
          branchId: r.branchId,
          countedQuantity: r.countedQuantity!,
        })),
      });
    },
    onSuccess: () => {
      toast.success('تم حفظ الجرد وتسوية المخزون');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setRows([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const changedCount = rows.filter((r) => r.countedQuantity !== null && r.countedQuantity !== r.currentQuantity).length;

  return (
    <>
      {/* Setup card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5" />
            إعداد الجرد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>الفرع *</Label>
              <BranchSelect value={branchId} onChange={setBranchId} placeholder="اختر الفرع…" />
            </div>
            <div className="space-y-2">
              <Label>الفئة (اختياري)</Label>
              <CategorySelect value={categoryId} onChange={setCategoryId} placeholder="كل الفئات" />
            </div>
            <div className="space-y-2">
              <Label>بحث</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="اسم أو SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
              </div>
            </div>
          </div>
          <Button onClick={initializeRows} disabled={!branchId || isLoading}>
            <Plus className="size-4" />
            <span>تحميل الأصناف للجرد</span>
          </Button>
        </CardContent>
      </Card>

      {/* Stocktake table */}
      {rows.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              جرد {rows.length} صنف
              {changedCount > 0 ? <span className="ml-2 text-sm font-normal text-warning">({changedCount} سيتم تعديله)</span> : null}
            </CardTitle>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              <Save className="size-4" />
              <span>حفظ التسوية ({changedCount})</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">SKU</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الكمية الحالية</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">العدد الفعلي</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الفرق</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => {
                    const diff = row.countedQuantity !== null ? row.countedQuantity - row.currentQuantity : null;
                    return (
                      <tr key={row.productId} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{row.productName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.sku}</td>
                        <td className="px-4 py-3 tabular-nums">{formatNumber(row.currentQuantity, 0)}</td>
                        <td className="px-4 py-3">
                          <Input type="number" min="0" value={row.countedQuantity ?? ''} onChange={(e) => updateCounted(row.productId, e.target.value)} className="h-8 w-24" placeholder="—" />
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium">
                          {diff !== null ? (
                            <span className={diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                              {diff > 0 ? '+' : ''}{formatNumber(diff, 0)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="icon-sm" variant="ghost" onClick={() => updateCounted(row.productId, '')} aria-label="مسح">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-3 size-12 opacity-50" />
            <p>اختر فرعاً واضغط "تحميل الأصناف للجرد" لبدء الجرد.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── Shared KPI Card ─────────────────────────────────────────────
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
          <div className={`flex size-9 items-center justify-center rounded-md ${variant === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
            {icon}
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
