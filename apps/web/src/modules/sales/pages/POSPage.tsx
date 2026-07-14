/**
 * POS Page — the main point-of-sale interface.
 *
 * Layout:
 *  ┌──────────────────────┬──────────────────┐
 *  │  Product Search      │  Cart            │
 *  │  + Results Grid      │  + Items         │
 *  │                      │  + Discount      │
 *  │                      │  + Totals        │
 *  │                      │  + Customer      │
 *  │                      │  + Payments      │
 *  │                      │  + Checkout      │
 *  └──────────────────────┴──────────────────┘
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  User,
  CreditCard,
  Wallet,
  Smartphone,
  CheckCircle2,
  Package as PackageIcon,
  ScanLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Label, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { CustomerSelect } from '@components/data/CustomerSelect';
import { useProductSearch } from '@modules/catalog/hooks/useCatalog';
import { productsApi, devicesApi } from '@modules/catalog/api/catalog.api';
import { salesApi } from '../api/sales.api';
import { usePosStore, type CartItem, type PaymentEntry } from '../stores/pos.store';
import { useAuthStore } from '@stores/auth.store';
import { useBranch } from '@modules/branches/hooks/useBranches';
import { formatCurrency } from '@core/utils/format';
import type { PaymentMethodKey, Product } from '@mobile-shop/shared';
import { cn } from '@core/utils/cn';
import { CategorySelect } from '@components/data/CategorySelect';

const PAYMENT_METHODS: Array<{ key: PaymentMethodKey; label: string; icon: typeof Wallet }> = [
  { key: 'cash', label: 'كاش', icon: Wallet },
  { key: 'card', label: 'بطاقة', icon: CreditCard },
  { key: 'vodafone_cash', label: 'فودافون كاش', icon: Smartphone },
  { key: 'instapay', label: 'إنستاباي', icon: Smartphone },
  { key: 'fawry', label: 'فوري', icon: CreditCard },
  { key: 'credit', label: 'آجل', icon: User },
];

export default function POSPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const branch = useBranch(user?.branchId ?? null);

  const pos = usePosStore();
  const [search, setSearch] = useState('');
  const [imeiInput, setImeiInput] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({ name: '', salePrice: 0, categoryId: null as string | null });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: searchResult, isLoading: searchLoading } = useProductSearch(search);

  // Keyboard shortcut: focus search on '/'.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const addProductToCart = (product: Product & { stock_level?: number }) => {
    if (product.type === 'imei') {
      // For IMEI products, we need to select a specific device unit.
      // For now, show a prompt to scan/enter IMEI.
      toast.info('المنتج يتتبّع بالـ IMEI. استخدم بحث IMEI لإضافة جهاز محدد.');
      return;
    }

    if (product.type === 'service') {
      pos.addItem({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productType: product.type,
        deviceUnitId: null,
        imei1: null,
        quantity: 1,
        unitPrice: product.sale_price,
        discount: 0,
        discountType: 'amount',
        taxRate: product.tax_rate,
        stockLevel: null,
      });
      return;
    }

    // Standard product.
    const stock = (product as Product & { stock_level?: number }).stock_level ?? 0;
    if (stock <= 0) {
      toast.warning('المخزون غير كافٍ');
      return;
    }
    const existing = pos.items.find((i) => i.productId === product.id && !i.deviceUnitId);
    if (existing && existing.quantity >= stock) {
      toast.warning(`المخزون المتاح: ${stock} فقط`);
      return;
    }
    pos.addItem({
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productType: product.type,
      deviceUnitId: null,
      imei1: null,
      quantity: 1,
      unitPrice: product.sale_price,
      discount: 0,
      discountType: 'amount',
      taxRate: product.tax_rate,
      stockLevel: stock,
    });
    setSearch('');
    searchInputRef.current?.focus();
  };

  const addDeviceByImei = async () => {
    if (!imeiInput.trim()) return;
    try {
      const device = await devicesApi.getByImei(imeiInput.trim());
      if (device.status !== 'in_stock') {
        toast.error(`الجهاز غير متاح (الحالة: ${device.status})`);
        return;
      }
      // Load product for pricing.
      const product = await productsApi.get(device.product_id);
      pos.addItem({
        productId: device.product_id,
        productName: product.name,
        productSku: product.sku,
        productType: 'imei',
        deviceUnitId: device.id,
        imei1: device.imei1,
        quantity: 1,
        unitPrice: device.sale_price || product.sale_price,
        discount: 0,
        discountType: 'amount',
        taxRate: product.tax_rate,
        stockLevel: null,
      });
      setImeiInput('');
      toast.success(`تمت إضافة: ${product.name} (${device.imei1})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'IMEI غير موجود');
    }
  };

  const checkoutMutation = useMutation({
    mutationFn: () => {
      if (!user?.branchId) {
        throw new Error('لا يوجد فرع مرتبط بحسابك');
      }
      return salesApi.create({
        branchId: user.branchId,
        cashierId: user.id,
        customerId: pos.customerId,
        items: pos.items.map((item) => ({
          productId: item.productId,
          deviceUnitId: item.deviceUnitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          discountType: item.discountType,
        })),
        payments: pos.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
        })),
        discount: pos.discount,
        discountType: pos.discountType,
        notes: pos.notes || null,
      });
    },
    onSuccess: (sale) => {
      toast.success(`تمت البيع بنجاح — فاتورة ${sale.invoice_no}`);
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (pos.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customer', pos.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      }
      pos.clearCart();
      setShowCheckout(false);
      navigate(`/sales/${sale.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Quick add product mutation
  const quickAddMutation = useMutation({
    mutationFn: async () => {
      if (!quickAddData.name.trim()) throw new Error('اسم المنتج مطلوب');
      if (quickAddData.salePrice <= 0) throw new Error('سعر البيع مطلوب');

      const sku = quickAddData.name
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 20) || `PRD-${Date.now().toString(36).toUpperCase()}`;

      const product = await productsApi.create({
        sku,
        name: quickAddData.name.trim(),
        barcode: null,
        categoryId: quickAddData.categoryId || null,
        branchId: user?.branchId ?? null,
        quantity: 0,
        type: 'standard',
        unit: 'piece',
        costPrice: 0,
        salePrice: quickAddData.salePrice,
        taxRate: 14,
        minQuantity: 0,
        hasWarranty: false,
        warrantyDays: 0,
        imageUrl: null,
        isActive: true,
      });
      return product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      // Add the new product to cart
      pos.addItem({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productType: product.type,
        deviceUnitId: null,
        imei1: null,
        quantity: 1,
        unitPrice: product.sale_price,
        discount: 0,
        discountType: 'amount',
        taxRate: product.tax_rate,
        stockLevel: 0,
      });
      toast.success(`تم إنشاء المنتج "${product.name}" وإضافته للسلة`);
      setShowQuickAdd(false);
      setQuickAddData({ name: '', salePrice: 0, categoryId: null });
      setSearch('');
      searchInputRef.current?.focus();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const subtotal = pos.getSubtotal();
  const saleDiscount = pos.getSaleDiscount();
  const tax = pos.getTax();
  const total = pos.getTotal();
  const totalPaid = pos.getTotalPaid();
  const change = pos.getChange();
  const dueAmount = pos.getDueAmount();

  return (
    <div className="flex h-[calc(100vh-var(--header-height))] overflow-hidden">
      {/* ─── Left: Product Search ──────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Search bar */}
        <div className="border-b bg-card p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="بحث بالاسم، SKU، باركود… (اضغط / للتركيز)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 pr-12 text-base"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بـ IMEI…"
                value={imeiInput}
                onChange={(e) => setImeiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addDeviceByImei();
                }}
                className="h-10 pr-9 font-mono"
                dir="ltr"
              />
            </div>
            <Button onClick={addDeviceByImei} variant="outline">
              <Plus className="size-4" />
              <span>إضافة IMEI</span>
            </Button>
          </div>
        </div>

        {/* Results grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {search && searchLoading ? (
            <LoadingState />
          ) : search && searchResult && searchResult.items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {searchResult.items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProductToCart(p)}
                  className="group flex flex-col rounded-lg border bg-card p-3 text-right transition-all hover:border-primary hover:shadow-card"
                >
                  <div className="aspect-square mb-2 rounded-md bg-muted/30">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="size-full rounded-md object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <PackageIcon className="size-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-bold text-primary">{formatCurrency(p.sale_price)}</span>
                    {p.type === 'standard' ? (
                      <Badge variant={(p.stock_level ?? 0) > 0 ? 'success' : 'destructive'} className="text-[10px]">
                        {p.stock_level ?? 0}
                      </Badge>
                    ) : p.type === 'imei' ? (
                      <Badge variant="info" className="text-[10px]">IMEI</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">خدمة</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : search && search.trim().length >= 2 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <PackageIcon className="size-12 mb-3 opacity-50" />
              <p>لا نتائج لـ "{search}"</p>
              {!showQuickAdd ? (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setShowQuickAdd(true);
                    setQuickAddData((prev) => ({ ...prev, name: search }));
                  }}
                >
                  <Plus className="size-4" />
                  <span>إضافة منتج جديد سريع</span>
                </Button>
              ) : (
                <div className="mt-4 w-full max-w-md rounded-lg border bg-card p-4 space-y-3">
                  <h3 className="font-semibold text-foreground">إضافة منتج سريع</h3>
                  <div className="space-y-2">
                    <Label className="text-xs">اسم المنتج *</Label>
                    <Input
                      value={quickAddData.name}
                      onChange={(e) => setQuickAddData((p) => ({ ...p, name: e.target.value }))}
                      placeholder="اسم المنتج"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">سعر البيع *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={quickAddData.salePrice || ''}
                      onChange={(e) => setQuickAddData((p) => ({ ...p, salePrice: Number(e.target.value) }))}
                      placeholder="0.00"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">الفئة</Label>
                    <CategorySelect
                      value={quickAddData.categoryId}
                      onChange={(v) => setQuickAddData((p) => ({ ...p, categoryId: v }))}
                      placeholder="— بدون فئة —"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQuickAdd(false)}
                    >
                      إلغاء
                    </Button>
                    <Button
                      size="sm"
                      loading={quickAddMutation.isPending}
                      onClick={() => quickAddMutation.mutate()}
                    >
                      <Plus className="size-4" />
                      <span>إنشاء وإضافة</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="size-12 mb-3 opacity-50" />
              <p>ابدأ بالبحث عن منتج أو امسح باركود</p>
              <p className="text-xs mt-1">اضغط / للتركيز على البحث</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Right: Cart ───────────────────────────────────────── */}
      <div className="flex w-[420px] flex-col border-r bg-card">
        {/* Cart header */}
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold">السلة</h2>
            <p className="text-xs text-muted-foreground">
              {pos.items.length} صنف • {branch?.name ?? 'فرع غير محدد'}
            </p>
          </div>
          {pos.items.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={pos.clearCart}>
              <Trash2 className="size-4" />
              <span>تفريغ</span>
            </Button>
          ) : null}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {pos.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="size-10 mb-2 opacity-40" />
              <p className="text-sm">السلة فارغة</p>
            </div>
          ) : (
            <div className="divide-y">
              {pos.items.map((item, idx) => (
                <CartItemRow key={`${item.productId}-${item.deviceUnitId ?? idx}`} item={item} index={idx} />
              ))}
            </div>
          )}
        </div>

        {/* Customer + totals + checkout */}
        <div className="border-t space-y-3 p-4">
          {/* Customer */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">العميل</Label>
            <CustomerSelect
              value={pos.customerId}
              onChange={(id) => pos.setCustomer(id, null)}
              placeholder="عميل نقدي (بدون اسم)"
            />
          </div>

          {/* Totals */}
          <div className="space-y-1 rounded-md bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            {saleDiscount > 0 ? (
              <div className="flex justify-between text-success">
                <span>الخصم</span>
                <span className="tabular-nums">-{formatCurrency(saleDiscount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">الضريبة</span>
              <span className="tabular-nums">{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <span>الإجمالي</span>
              <span className="tabular-nums text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Checkout button */}
          <Button
            className="w-full"
            size="lg"
            disabled={pos.items.length === 0}
            onClick={() => setShowCheckout(true)}
          >
            <CheckCircle2 className="size-5" />
            <span>إتمام البيع — {formatCurrency(total)}</span>
          </Button>
        </div>
      </div>

      {/* ─── Checkout Modal ────────────────────────────────────── */}
      {showCheckout ? (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onCheckout={() => checkoutMutation.mutate()}
          loading={checkoutMutation.isPending}
          total={total}
          totalPaid={totalPaid}
          change={change}
          dueAmount={dueAmount}
          hasCustomer={!!pos.customerId}
        />
      ) : null}
    </div>
  );
}

// ─── Cart item row ─────────────────────────────────────────────────

function CartItemRow({ item, index }: { item: CartItem; index: number }) {
  const pos = usePosStore();
  const gross = item.unitPrice * item.quantity;
  const itemDiscount =
    item.discountType === 'percent' ? (gross * item.discount) / 100 : item.discount;
  const itemTotal = gross - itemDiscount;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-1">{item.productName}</p>
          {item.imei1 ? (
            <p className="text-xs text-muted-foreground font-mono" dir="ltr">IMEI: {item.imei1}</p>
          ) : (
            <p className="text-xs text-muted-foreground font-mono">{item.productSku}</p>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-destructive shrink-0"
          onClick={() => pos.removeItem(index)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* Quantity controls */}
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => pos.decrementItem(index)}>
            <Minus className="size-3" />
          </Button>
          <span className="w-10 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => {
              if (item.stockLevel !== null && item.quantity >= item.stockLevel) {
                toast.warning(`المخزون المتاح: ${item.stockLevel}`);
                return;
              }
              pos.incrementItem(index);
            }}
            disabled={item.productType === 'imei'}
          >
            <Plus className="size-3" />
          </Button>
        </div>

        {/* Price + total */}
        <div className="text-left">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              value={item.unitPrice}
              onChange={(e) => pos.updateItem(index, { unitPrice: Number(e.target.value) })}
              className="h-7 w-20 text-xs"
              dir="ltr"
            />
            <span className="text-xs text-muted-foreground">/ {item.productSku ? '' : ''}</span>
          </div>
          <p className="mt-0.5 text-sm font-bold tabular-nums">{formatCurrency(itemTotal)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Checkout Modal ────────────────────────────────────────────────

interface CheckoutModalProps {
  onClose: () => void;
  onCheckout: () => void;
  loading: boolean;
  total: number;
  totalPaid: number;
  change: number;
  dueAmount: number;
  hasCustomer: boolean;
}

function CheckoutModal({
  onClose,
  onCheckout,
  loading,
  total,
  totalPaid,
  change,
  dueAmount,
  hasCustomer,
}: CheckoutModalProps) {
  const pos = usePosStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodKey>('cash');
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState('');

  const addPayment = () => {
    if (amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً');
      return;
    }
    const entry: PaymentEntry = {
      method: selectedMethod,
      amount,
      reference: reference || null,
    };
    pos.addPayment(entry);
    setAmount(0);
    setReference('');

    // Quick-fill: if cash and no amount, set to remaining.
  };

  const quickCash = () => {
    const remaining = total - pos.getTotalPaid();
    setAmount(Math.max(0, remaining));
  };

  const remaining = total - pos.getTotalPaid();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">إتمام البيع</h2>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {/* Total */}
          <div className="rounded-md bg-primary/10 p-4 text-center">
            <p className="text-sm text-muted-foreground">الإجمالي المطلوب</p>
            <p className="text-3xl font-bold text-primary tabular-nums">{formatCurrency(total)}</p>
            {dueAmount > 0 ? (
              <Badge variant="warning" className="mt-1">
                دين: {formatCurrency(dueAmount)}
              </Badge>
            ) : null}
          </div>

          {/* Existing payments */}
          {pos.payments.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">المدفوعات</p>
              {pos.payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {PAYMENT_METHODS.find((m) => m.key === p.method)?.label ?? p.method}
                    </Badge>
                    {p.reference ? (
                      <span className="text-xs text-muted-foreground" dir="ltr">{p.reference}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{formatCurrency(p.amount)}</span>
                    <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => pos.removePayment(i)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 text-sm">
                <span className="text-muted-foreground">المتبقي</span>
                <span className={cn('font-bold tabular-nums', remaining > 0 ? 'text-destructive' : 'text-success')}>
                  {formatCurrency(Math.max(0, remaining))}
                </span>
              </div>
            </div>
          ) : null}

          {/* Add payment form */}
          {remaining > 0 || pos.payments.length === 0 ? (
            <div className="space-y-3 rounded-md border p-3">
              {/* Method selection */}
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setSelectedMethod(m.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors',
                      selectedMethod === m.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input hover:bg-muted/50',
                    )}
                  >
                    <m.icon className="size-4" />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    placeholder="المبلغ"
                    dir="ltr"
                  />
                </div>
                {selectedMethod === 'cash' ? (
                  <Button variant="outline" size="sm" onClick={quickCash}>
                    المتبقي
                  </Button>
                ) : null}
              </div>

              {/* Reference (for digital payments) */}
              {selectedMethod !== 'cash' && selectedMethod !== 'credit' ? (
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="مرجع المعاملة (اختياري)"
                  dir="ltr"
                />
              ) : null}

              {/* Credit warning */}
              {selectedMethod === 'credit' && !hasCustomer ? (
                <p className="text-xs text-destructive">⚠️ البيع الآجل يتطلب تحديد عميل</p>
              ) : null}

              <Button onClick={addPayment} variant="outline" className="w-full">
                <Plus className="size-4" />
                <span>إضافة دفعة</span>
              </Button>
            </div>
          ) : null}

          {/* Change */}
          {change > 0 ? (
            <div className="rounded-md bg-success/10 p-3 text-center">
              <p className="text-sm text-muted-foreground">المتبقي للعميل (صرف)</p>
              <p className="text-2xl font-bold text-success tabular-nums">{formatCurrency(change)}</p>
            </div>
          ) : null}

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Input
              value={pos.notes}
              onChange={(e) => pos.setNotes(e.target.value)}
              placeholder="ملاحظات على الفاتورة"
            />
          </div>

          {/* Checkout button */}
          <Button
            className="w-full"
            size="lg"
            onClick={onCheckout}
            loading={loading}
            disabled={pos.payments.length === 0 || (dueAmount > 0 && !hasCustomer)}
          >
            <CheckCircle2 className="size-5" />
            <span>تأكيد البيع</span>
          </Button>

          {pos.payments.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">أضف دفعة واحدة على الأقل</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
