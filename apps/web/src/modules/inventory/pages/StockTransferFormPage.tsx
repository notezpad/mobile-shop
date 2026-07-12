import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Plus, Trash2, Package as PackageIcon } from 'lucide-react';
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
} from '@components/ui';
import { BranchSelect } from '@components/data/BranchSelect';
import { productsApi } from '@modules/catalog/api/catalog.api';
import { stockTransfersApi } from '../api/inventory.api';
import type { Product } from '@mobile-shop/shared';

interface TransferItem {
  productId: string;
  quantity: number;
}

export default function StockTransferFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fromBranchId, setFromBranchId] = useState<string | null>(null);
  const [toBranchId, setToBranchId] = useState<string | null>(null);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Load standard products (no IMEI) for the dropdown.
  const { data: productsResult } = useQuery({
    queryKey: ['products', 'transfer-eligible', { page: 1, pageSize: 200, type: 'standard' }],
    queryFn: () =>
      productsApi.list({
        page: 1,
        pageSize: 200,
        type: 'standard',
        sortBy: 'name',
        sortDir: 'asc',
      }),
  });
  const allProducts = productsResult?.items ?? [];
  const filteredProducts = productSearch
    ? allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(productSearch.toLowerCase()),
      )
    : allProducts;

  const addItem = (productId: string) => {
    if (items.some((i) => i.productId === productId)) {
      toast.warning('المنتج مضاف بالفعل');
      return;
    }
    setItems([...items, { productId, quantity: 1 }]);
    setProductSearch('');
  };

  const updateQty = (productId: string, qty: number) => {
    setItems(items.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i)));
  };

  const removeItem = (productId: string) => {
    setItems(items.filter((i) => i.productId !== productId));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      stockTransfersApi.create({
        fromBranchId: fromBranchId!,
        toBranchId: toBranchId!,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        notes: notes || undefined,
      }),
    onSuccess: (transfer) => {
      toast.success('تم إنشاء التحويل. شحنه الآن لخصم المخزون.');
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      navigate(`/inventory/transfers/${transfer.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!fromBranchId) {
      toast.error('اختر الفرع المصدري');
      return;
    }
    if (!toBranchId) {
      toast.error('اختر الفرع الوجهة');
      return;
    }
    if (fromBranchId === toBranchId) {
      toast.error('لا يمكن التحويل بين فرع ونفسه');
      return;
    }
    if (items.length === 0) {
      toast.error('أضف منتجاً واحداً على الأقل');
      return;
    }
    createMutation.mutate();
  };

  const productMap = new Map(allProducts.map((p) => [p.id, p]));

  return (
    <div className="page-container">
      <PageHeader
        title="تحويل مخزون جديد"
        description="حوّل أصنافاً بين الفروع"
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory/transfers">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      {/* Branches */}
      <Card>
        <CardHeader>
          <CardTitle>الفروع</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>الفرع المصدري *</Label>
            <BranchSelect value={fromBranchId} onChange={setFromBranchId} placeholder="اختر الفرع المصدري…" />
          </div>
          <div className="space-y-2">
            <Label>الفرع الوجهة *</Label>
            <BranchSelect value={toBranchId} onChange={setToBranchId} placeholder="اختر الفرع الوجهة…" />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle>الأصناف ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product search + add */}
          <div className="space-y-2">
            <Label>إضافة منتج</Label>
            <Input
              placeholder="ابحث بالاسم أو SKU…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {productSearch && filteredProducts.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {filteredProducts.slice(0, 10).map((p: Product) => (
                  <button
                    key={p.id}
                    onClick={() => addItem(p.id)}
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-right text-sm hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                    </div>
                    <Plus className="size-4 text-primary" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Selected items */}
          {items.length > 0 ? (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right">
                  <tr>
                    <th className="px-3 py-2 font-medium text-muted-foreground">المنتج</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">SKU</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">الكمية</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => {
                    const product = productMap.get(item.productId);
                    return (
                      <tr key={item.productId}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <PackageIcon className="size-4 text-muted-foreground" />
                            <span>{product?.name ?? 'منتج محذوف'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{product?.sku ?? '—'}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQty(item.productId, Number(e.target.value))}
                            className="h-8 w-24"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => removeItem(item.productId)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              لا توجد أصناف مضافة بعد
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ملاحظات للتحويل…"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link to="/inventory/transfers">إلغاء</Link>
        </Button>
        <Button onClick={handleSubmit} loading={createMutation.isPending}>
          <Save className="size-4" />
          <span>إنشاء التحويل</span>
        </Button>
      </div>
    </div>
  );
}
