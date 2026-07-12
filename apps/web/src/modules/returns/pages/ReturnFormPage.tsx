/**
 * Return create form — select a sale, choose items to return, set refund method.
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Search, Receipt } from 'lucide-react';
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
  Textarea,
  Badge,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useAuthStore } from '@stores/auth.store';
import { salesApi } from '@modules/sales/api/sales.api';
import { returnsApi } from '../api/returns.api';
import type { SaleWithDetails } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';

interface ReturnItemDraft {
  saleItemId: string;
  productId: string;
  productName: string;
  imei1: string | null;
  maxQuantity: number;
  returnQuantity: number;
  unitPrice: number;
  refundAmount: number;
  selected: boolean;
}

const REFUND_METHODS = [
  { value: 'cash', label: 'كاش' },
  { value: 'card', label: 'بطاقة' },
  { value: 'vodafone_cash', label: 'فودافون كاش' },
  { value: 'instapay', label: 'إنستاباي' },
  { value: 'fawry', label: 'فوري' },
  { value: 'credit', label: 'آجل (رصيد العميل)' },
  { value: 'store_credit', label: 'رصيد متجر' },
];

export default function ReturnFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [saleSearch, setSaleSearch] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [items, setItems] = useState<ReturnItemDraft[]>([]);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');

  // Search sales by invoice_no.
  const { data: salesResult } = useQuery({
    queryKey: ['sales', 'return-search', saleSearch],
    queryFn: () =>
      salesApi.list({
        page: 1,
        pageSize: 10,
        search: saleSearch,
        status: 'completed',
        sortBy: 'createdAt',
        sortDir: 'desc',
      }),
    enabled: saleSearch.trim().length >= 2,
  });

  // Load selected sale details.
  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ['sale', selectedSaleId],
    queryFn: () => salesApi.get(selectedSaleId!),
    enabled: !!selectedSaleId,
  });

  // Initialize items when sale loads.
  useEffect(() => {
    if (sale) {
      setItems(
        sale.items.map((item) => ({
          saleItemId: item.id,
          productId: item.product_id,
          productName: item.product_name ?? 'منتج',
          imei1: item.imei1 ?? null,
          maxQuantity: item.quantity,
          returnQuantity: 0,
          unitPrice: item.unit_price,
          refundAmount: 0,
          selected: false,
        })),
      );
    }
  }, [sale]);

  const updateItem = (idx: number, updates: Partial<ReturnItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...updates } : it)));
  };

  const totalRefund = items
    .filter((i) => i.selected)
    .reduce((sum, i) => sum + i.refundAmount, 0);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!user?.branchId) throw new Error('لا يوجد فرع مرتبط بحسابك');
      const selectedItems = items.filter((i) => i.selected && i.returnQuantity > 0);
      if (selectedItems.length === 0) throw new Error('اختر صنفاً واحداً على الأقل');
      return returnsApi.create({
        saleId: selectedSaleId!,
        branchId: user.branchId,
        customerId: sale?.customer_id ?? null,
        reason: reason || undefined,
        refundMethod: refundMethod as 'cash' | 'card' | 'vodafone_cash' | 'instapay' | 'fawry' | 'credit' | 'store_credit',
        items: selectedItems.map((i) => ({
          saleItemId: i.saleItemId,
          quantity: i.returnQuantity,
          refundAmount: i.refundAmount,
        })),
      });
    },
    onSuccess: async (ret) => {
      toast.success(`تم إنشاء المرتجع ${ret.return_no}`);
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      if (sale?.customer_id) {
        queryClient.invalidateQueries({ queryKey: ['customer', sale.customer_id] });
      }
      navigate(`/returns/${ret.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="مرتجع جديد"
        description="إنشاء مرتجع لبيع موجود"
        actions={
          <Button asChild variant="outline">
            <Link to="/returns">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      {/* Sale search */}
      <Card>
        <CardHeader>
          <CardTitle>1. ابحث عن الفاتورة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث برقم الفاتورة…"
              value={saleSearch}
              onChange={(e) => setSaleSearch(e.target.value)}
              className="pr-9"
              disabled={!!selectedSaleId}
            />
          </div>
          {salesResult && !selectedSaleId ? (
            <div className="divide-y rounded-md border">
              {salesResult.items.map((s: SaleWithDetails) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSaleId(s.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right hover:bg-muted/50"
                >
                  <div>
                    <p className="font-mono text-sm">{s.invoice_no}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.customer_name ?? 'عميل نقدي'} • {formatCurrency(s.total)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {new Date(s.created_at).toLocaleDateString('ar-EG')}
                  </Badge>
                </button>
              ))}
              {salesResult.items.length === 0 ? (
                <p className="p-3 text-center text-sm text-muted-foreground">لا نتائج</p>
              ) : null}
            </div>
          ) : null}
          {selectedSaleId ? (
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
              <div>
                <p className="font-mono text-sm font-medium">{sale?.invoice_no}</p>
                <p className="text-xs text-muted-foreground">
                  {sale?.customer_name ?? 'عميل نقدي'} • {formatCurrency(sale?.total ?? 0)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedSaleId(null);
                  setItems([]);
                  setSaleSearch('');
                }}
              >
                تغيير
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Items */}
      {selectedSaleId ? (
        saleLoading ? (
          <LoadingState message="جارٍ تحميل الفاتورة…" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>2. اختر الأصناف المرتجعة</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/30 text-right">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">الصنف</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">الكمية</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">المرتجع</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">السعر</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">الاسترجاع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => (
                      <tr key={idx} className={item.selected ? 'bg-primary/5' : ''}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) => {
                              updateItem(idx, {
                                selected: e.target.checked,
                                returnQuantity: e.target.checked ? 1 : 0,
                                refundAmount: e.target.checked ? item.unitPrice : 0,
                              });
                            }}
                            className="size-4 accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.productName}</p>
                          {item.imei1 ? (
                            <p className="text-xs text-muted-foreground font-mono" dir="ltr">{item.imei1}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{item.maxQuantity}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="1"
                            max={item.maxQuantity}
                            value={item.returnQuantity || ''}
                            onChange={(e) => {
                              const qty = Math.min(Number(e.target.value), item.maxQuantity);
                              updateItem(idx, {
                                returnQuantity: qty,
                                refundAmount: qty * item.unitPrice,
                                selected: qty > 0,
                              });
                            }}
                            disabled={!item.selected}
                            className="h-8 w-20"
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.refundAmount || ''}
                            onChange={(e) => updateItem(idx, { refundAmount: Number(e.target.value) })}
                            disabled={!item.selected}
                            className="h-8 w-24"
                            dir="ltr"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-left font-medium">إجمالي الاسترجاع:</td>
                      <td className="px-3 py-2 font-bold tabular-nums text-primary">{formatCurrency(totalRefund)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      ) : null}

      {/* Refund method + reason */}
      {selectedSaleId ? (
        <Card>
          <CardHeader>
            <CardTitle>3. طريقة الاسترجاع + السبب</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="refundMethod">طريقة الاسترجاع</Label>
              <select
                id="refundMethod"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
              >
                {REFUND_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reason">السبب</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="سبب المرتجع (اختياري)"
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Actions */}
      {selectedSaleId ? (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/returns">إلغاء</Link>
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={items.filter((i) => i.selected).length === 0}
          >
            <Save className="size-4" />
            <span>إنشاء المرتجع</span>
          </Button>
        </div>
      ) : null}

      {void Receipt}
    </div>
  );
}
