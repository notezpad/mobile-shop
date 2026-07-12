import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Smartphone, Trash2, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Badge,
  Textarea,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { BranchSelect } from '@components/data/BranchSelect';
import { devicesApi, productsApi } from '../api/catalog.api';
import { useCategories } from '@modules/catalog/hooks/useCatalog';
import type { DeviceUnit, DeviceUnitStatus, BatchImportResult } from '@mobile-shop/shared';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate } from '@core/utils/date';

type StatusMeta = {
  label: string;
  variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary';
};

const STATUS_LABELS: Record<string, StatusMeta> = {
  in_stock: { label: 'في المخزون', variant: 'success' },
  reserved: { label: 'محجوز', variant: 'warning' },
  sold: { label: 'مباع', variant: 'info' },
  returned: { label: 'مرتجع', variant: 'secondary' },
  defective: { label: 'تالف', variant: 'destructive' },
};

const DEFAULT_STATUS_META: StatusMeta = STATUS_LABELS.in_stock!;

export default function DevicesListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceUnitStatus | ''>('');
  const [productIdFilter, setProductIdFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const pageSize = 20;
  const queryClient = useQueryClient();

  // Load IMEI products for filter dropdown.
  const { data: productsResult } = useQuery({
    queryKey: ['products', 'imei-products', { page: 1, pageSize: 100, type: 'imei' }],
    queryFn: () =>
      productsApi.list({
        page: 1,
        pageSize: 100,
        type: 'imei',
        sortBy: 'name',
        sortDir: 'asc',
      }),
  });
  const imeiProducts = productsResult?.items ?? [];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['devices', { page, pageSize, search, statusFilter, productIdFilter, branchFilter }],
    queryFn: () =>
      devicesApi.list({
        page,
        pageSize,
        search: search || undefined,
        status: (statusFilter || undefined) as DeviceUnitStatus | undefined,
        productId: productIdFilter || undefined,
        branchId: branchFilter ?? undefined,
        sortBy: 'receivedAt',
        sortDir: 'desc',
      }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف الجهاز');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const devices = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Product lookup map.
  const productMap = new Map(imeiProducts.map((p) => [p.id, p]));

  return (
    <div className="page-container">
      <PageHeader
        title="الأجهزة (IMEI)"
        description={`${total} جهاز مُتبّقّي`}
        actions={
          <RequirePermission permission="catalog.devices.create">
            <Button onClick={() => setShowImport(true)}>
              <Plus className="size-4" />
              <span>إضافة أجهزة (دفعة)</span>
            </Button>
          </RequirePermission>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بـ IMEI / Serial…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pr-9 font-mono"
                dir="ltr"
              />
            </div>
            <select
              value={productIdFilter}
              onChange={(e) => {
                setProductIdFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">كل المنتجات</option>
              {imeiProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as DeviceUnitStatus | '');
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <BranchSelect
              value={branchFilter}
              onChange={(v) => {
                setBranchFilter(v);
                setPage(1);
              }}
              placeholder="كل الفروع"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <LoadingState />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<Smartphone />}
          title="لا توجد أجهزة"
          description="ابدأ باستيراد دفعة من أجهزة IMEI"
          action={
            <RequirePermission permission="catalog.devices.create">
              <Button onClick={() => setShowImport(true)}>
                <Plus className="size-4" />
                <span>إضافة أجهزة</span>
              </Button>
            </RequirePermission>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">IMEI</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">التكلفة</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">سعر البيع</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">استلام</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devices.map((d: DeviceUnit) => {
                    const product = productMap.get(d.product_id);
                    const statusMeta = STATUS_LABELS[d.status] ?? DEFAULT_STATUS_META;
                    return (
                      <tr key={d.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs" dir="ltr">{d.imei1}</td>
                        <td className="px-4 py-3">
                          {product ? (
                            <span className="line-clamp-1">{product.name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">منتج محذوف</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(d.cost)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(d.sale_price)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(d.received_at)}
                        </td>
                        <td className="px-4 py-3">
                          <RequirePermission permission="catalog.devices.delete" fallback={null}>
                            {d.status !== 'sold' ? (
                              <ConfirmDialog
                                trigger={
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    aria-label="حذف"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                }
                                title="حذف الجهاز"
                                description={`هل أنت متأكد من حذف الجهاز بـ IMEI ${d.imei1}؟`}
                                confirmLabel="حذف"
                                destructive
                                onConfirm={async () => {
                                  await deleteMutation.mutateAsync(d.id);
                                }}
                              />
                            ) : null}
                          </RequirePermission>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  صفحة {page} من {totalPages}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isFetching}
                  >
                    التالي
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {showImport ? (
        <BatchImportDialog
          onClose={() => setShowImport(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['devices'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            setShowImport(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Batch import dialog ───────────────────────────────────────────

function BatchImportDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [productId, setProductId] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [cost, setCost] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [imeisText, setImeisText] = useState('');
  const [result, setResult] = useState<BatchImportResult | null>(null);

  const imeis = imeisText
    .split(/[\s,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const importMutation = useMutation({
    mutationFn: () =>
      devicesApi.batchCreate({
        productId,
        branchId: branchId!,
        cost,
        salePrice,
        imeis,
      }),
    onSuccess: (data) => {
      setResult(data);
      if (data.inserted > 0) {
        toast.success(`تم استيراد ${data.inserted} جهاز بنجاح`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!productId) {
      toast.error('اختر المنتج');
      return;
    }
    if (!branchId) {
      toast.error('اختر الفرع');
      return;
    }
    if (imeis.length === 0) {
      toast.error('أدخل IMEI واحد على الأقل');
      return;
    }
    importMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <Card className="w-full max-w-2xl">
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">استيراد دفعة أجهزة IMEI</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="productId">المنتج *</Label>
              <select
                id="productId"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
              >
                <option value="">اختر المنتج…</option>
                {/* Load IMEI products on the fly */}
                <BatchProductOptions />
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branchId">الفرع *</Label>
              <BranchSelect value={branchId} onChange={setBranchId} placeholder="اختر الفرع…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">سعر التكلفة للوحدة</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salePrice">سعر البيع للوحدة</Label>
              <Input
                id="salePrice"
                type="number"
                step="0.01"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imeis">
              قائمة IMEIs * <span className="text-xs text-muted-foreground">({imeis.length} IMEI)</span>
            </Label>
            <Textarea
              id="imeis"
              value={imeisText}
              onChange={(e) => {
                setImeisText(e.target.value);
                setResult(null);
              }}
              rows={8}
              placeholder="الصق أو امسح IMEIs هنا — كل IMEI في سطر أو مفصول بفاصلة/مسافة"
              dir="ltr"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              يمكنك لصق قائمة من جهاز مسح الباركود أو كتابتها يدوياً. كل IMEI يجب أن يكون 15 رقماً.
            </p>
          </div>

          {/* Result */}
          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-success" />
                <span className="font-medium">تم الاستيراد: {result.inserted}</span>
              </div>
              {result.duplicates.length > 0 ? (
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle className="mt-0.5 size-4 text-warning" />
                  <div>
                    <p className="font-medium">مكرر ({result.duplicates.length}):</p>
                    <p dir="ltr" className="font-mono text-xs text-muted-foreground">
                      {result.duplicates.slice(0, 5).join(', ')}
                      {result.duplicates.length > 5 ? ` … +${result.duplicates.length - 5}` : ''}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={importMutation.isPending}>
              {result ? 'إغلاق' : 'إلغاء'}
            </Button>
            {!result ? (
              <Button onClick={handleSubmit} loading={importMutation.isPending}>
                <Upload className="size-4" />
                <span>استيراد {imeis.length > 0 ? `(${imeis.length})` : ''}</span>
              </Button>
            ) : null}
            {result && result.inserted > 0 ? (
              <Button onClick={onSaved}>تم</Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BatchProductOptions() {
  const { data: result } = useQuery({
    queryKey: ['products', 'imei-products', { page: 1, pageSize: 200, type: 'imei' }],
    queryFn: () =>
      productsApi.list({
        page: 1,
        pageSize: 200,
        type: 'imei',
        sortBy: 'name',
        sortDir: 'asc',
      }),
  });
  return (
    <>
      {(result?.items ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.sku})
        </option>
      ))}
    </>
  );
}

void useCategories;
void formatNumber;
