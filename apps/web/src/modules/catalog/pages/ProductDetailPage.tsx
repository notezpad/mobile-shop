import { useParams, Link } from 'react-router-dom';
import {
  ArrowRight,
  Pencil,
  Package,
  Tag,
  Boxes,
  Smartphone,
  Wrench,
  ShieldCheck,
  ImageOff,
} from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useProduct, useCategoryPath } from '../hooks/useCatalog';
import { useBranch } from '@modules/branches/hooks/useBranches';
import { BarcodeDisplay } from '@components/data/BarcodeDisplay';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate } from '@core/utils/date';

type TypeMeta = {
  label: string;
  variant: 'default' | 'info' | 'success';
  icon: typeof Package;
};

const TYPE_LABELS: Record<string, TypeMeta> = {
  standard: { label: 'قياسي', variant: 'default', icon: Package },
  imei: { label: 'IMEI', variant: 'info', icon: Smartphone },
  service: { label: 'خدمة', variant: 'success', icon: Wrench },
};

const DEFAULT_TYPE_META: TypeMeta = TYPE_LABELS.standard!;

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProduct(id);
  const categoryPath = useCategoryPath(product?.category_id ?? null);

  if (isLoading || !product) return <LoadingState message="جارٍ تحميل المنتج…" />;

  const typeMeta = TYPE_LABELS[product.type] ?? DEFAULT_TYPE_META;
  const profit = product.sale_price - product.cost_price;
  const profitMargin = product.sale_price > 0 ? (profit / product.sale_price) * 100 : 0;

  return (
    <div className="page-container">
      <PageHeader
        title={product.name}
        description={product.sku}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/catalog/products">
                <ArrowRight className="size-4" />
                <span>العودة</span>
              </Link>
            </Button>
            <RequirePermission permission="catalog.products.edit">
              <Button asChild>
                <Link to={`/catalog/products/${product.id}/edit`}>
                  <Pencil className="size-4" />
                  <span>تعديل</span>
                </Link>
              </Button>
            </RequirePermission>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Image */}
        <Card>
          <CardContent className="p-0">
            <div className="aspect-square">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="size-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center rounded-lg bg-muted/30 text-muted-foreground">
                  <ImageOff className="size-16" />
                  <p className="mt-2 text-sm">لا توجد صورة</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="size-5" />
              التسعير
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">سعر التكلفة</span>
              <span className="font-medium">{formatCurrency(product.cost_price)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">سعر البيع</span>
              <span className="text-lg font-bold text-primary">{formatCurrency(product.sale_price)}</span>
            </div>
            {product.wholesale_price ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">سعر الجملة</span>
                <span className="font-medium">{formatCurrency(product.wholesale_price)}</span>
              </div>
            ) : null}
            <div className="border-t pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">الربح للوحدة</span>
                <span className={`font-bold ${profit > 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(profit)} ({profitMargin.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">الضريبة</span>
              <Badge variant="outline">{product.tax_rate}%</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Inventory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="size-5" />
              المخزون
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={typeMeta.variant} className="mb-2">
              <typeMeta.icon className="size-3" />
              {typeMeta.label}
            </Badge>
            {product.type === 'imei' ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">أجهزة في المخزون</span>
                <span className="text-2xl font-bold text-success">
                  {product.device_units_count ?? 0}
                </span>
              </div>
            ) : product.type === 'standard' ? (
              <>
                {product.stock_levels && product.stock_levels.length > 0 ? (
                  product.stock_levels.map((s, i) => <BranchStockRow key={i} branchId={s.branch_id} quantity={s.quantity - s.reserved_quantity} />)
                ) : (
                  <p className="text-sm text-muted-foreground">لا يوجد مخزون مسجل.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">خدمة — لا مخزون.</p>
            )}
            {product.type !== 'service' ? (
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-sm text-muted-foreground">حد التنبيه</span>
                <span className="font-medium">{formatNumber(product.min_quantity, 0)} {product.unit}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Details grid */}
      <Card>
        <CardHeader>
          <CardTitle>تفاصيل المنتج</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailRow label="SKU" value={<code className="font-mono">{product.sku}</code>} />
          {product.barcode ? (
            <DetailRow label="الباركود" value={<code className="font-mono">{product.barcode}</code>} />
          ) : null}
          {product.barcode ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground mb-1">باركود المنتج</p>
              <BarcodeDisplay value={product.barcode} height={50} className="rounded-md border p-2" />
            </div>
          ) : null}
          {product.name_ar ? <DetailRow label="الاسم بالعربية" value={product.name_ar} /> : null}
          {product.brand ? <DetailRow label="العلامة التجارية" value={product.brand} /> : null}
          {product.model ? <DetailRow label="الموديل" value={product.model} /> : null}
          <DetailRow
            label="الفئة"
            value={
              categoryPath.length > 0
                ? categoryPath.map((c) => c.name).join(' / ')
                : '— بدون فئة —'
            }
          />
          <DetailRow label="وحدة القياس" value={product.unit} />
          {product.has_warranty ? (
            <DetailRow
              label="الضمان"
              value={
                <span className="flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-success" />
                  {product.warranty_days} يوم
                </span>
              }
            />
          ) : null}
          <DetailRow
            label="الحالة"
            value={
              <Badge variant={product.is_active ? 'success' : 'destructive'}>
                {product.is_active ? 'نشط' : 'موقوف'}
              </Badge>
            }
          />
          <DetailRow label="تاريخ الإنشاء" value={formatDate(product.created_at)} />
          {product.description ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-muted-foreground">الوصف</p>
              <p className="mt-1 text-sm">{product.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function BranchStockRow({ branchId, quantity }: { branchId: string; quantity: number }) {
  const branch = useBranch(branchId);
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{branch?.name ?? 'فرع محذوف'}</span>
      <span className="font-bold">{quantity}</span>
    </div>
  );
}
