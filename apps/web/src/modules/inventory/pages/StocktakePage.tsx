import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Save, ClipboardCheck, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { BranchSelect } from '@components/data/BranchSelect';
import { CategorySelect } from '@components/data/CategorySelect';
import { useStockLevels } from '../hooks/useInventory';
import { inventoryApi } from '../api/inventory.api';
import type { StockLevel } from '../hooks/useInventory';
import { formatNumber } from '@core/utils/format';

interface AdjustmentRow {
  productId: string;
  productName: string;
  sku: string;
  currentQuantity: number;
  countedQuantity: number | null;
  branchId: string;
}

export default function StocktakePage() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AdjustmentRow[]>([]);
  const queryClient = useQueryClient();

  // Load stock levels for the selected branch + category.
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
        countedQuantity: null, // null = not yet counted
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
    <div className="page-container">
      <PageHeader
        title="جرد المخزون"
        description="عدّ الأصناف فعلياً وسوّي الفروقات تلقائياً"
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory">
              <ArrowRight className="size-4" />
              <span>العودة للمخزون</span>
            </Link>
          </Button>
        }
      />

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
                <Input
                  placeholder="اسم أو SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                />
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
              {changedCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-warning">
                  ({changedCount} سيتم تعديله)
                </span>
              ) : null}
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
                    const diff =
                      row.countedQuantity !== null ? row.countedQuantity - row.currentQuantity : null;
                    return (
                      <tr key={row.productId} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{row.productName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.sku}</td>
                        <td className="px-4 py-3 tabular-nums">{formatNumber(row.currentQuantity, 0)}</td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min="0"
                            value={row.countedQuantity ?? ''}
                            onChange={(e) => updateCounted(row.productId, e.target.value)}
                            className="h-8 w-24"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-4 py-3 tabular-nums font-medium">
                          {diff !== null ? (
                            <span
                              className={
                                diff > 0
                                  ? 'text-success'
                                  : diff < 0
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              }
                            >
                              {diff > 0 ? '+' : ''}
                              {formatNumber(diff, 0)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => updateCounted(row.productId, '')}
                            aria-label="مسح"
                          >
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
    </div>
  );
}
