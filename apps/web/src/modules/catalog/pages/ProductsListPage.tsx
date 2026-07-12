import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Package, Pencil, Trash2, Smartphone, Wrench, Box, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { CategorySelect } from '@components/data/CategorySelect';
import { productsApi } from '../api/catalog.api';
import type { Product } from '@mobile-shop/shared';
import { formatCurrency } from '@core/utils/format';

const TYPE_OPTIONS = [
  { value: '', label: 'كل الأنواع', icon: Box },
  { value: 'standard', label: 'قياسي', icon: Package },
  { value: 'imei', label: 'IMEI', icon: Smartphone },
  { value: 'service', label: 'خدمة', icon: Wrench },
];

type TypeMeta = {
  label: string;
  icon: typeof Package;
  variant: 'default' | 'info' | 'success';
};

const TYPE_LABELS: Record<string, TypeMeta> = {
  standard: { label: 'قياسي', icon: Package, variant: 'default' },
  imei: { label: 'IMEI', icon: Smartphone, variant: 'info' },
  service: { label: 'خدمة', icon: Wrench, variant: 'success' },
};

const DEFAULT_TYPE_META: TypeMeta = TYPE_LABELS.standard!;

export default function ProductsListPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', { page, pageSize, search, categoryId, typeFilter, showLowStock }],
    queryFn: () =>
      productsApi.list({
        page,
        pageSize,
        search: search || undefined,
        categoryId: categoryId ?? undefined,
        type: (typeFilter || undefined) as 'standard' | 'imei' | 'service' | undefined,
        isActive: undefined,
        lowStock: showLowStock ? 'true' : undefined,
        sortBy: 'createdAt',
        sortDir: 'desc',
      }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف المنتج');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="page-container">
      <PageHeader
        title="المنتجات"
        description={`${total} منتج مسجل`}
        actions={
          <RequirePermission permission="catalog.products.create">
            <Button asChild>
              <Link to="/catalog/products/new">
                <Plus className="size-4" />
                <span>إضافة منتج</span>
              </Link>
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
                placeholder="بحث بالاسم، SKU، باركود…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pr-9"
              />
            </div>
            <CategorySelect
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setPage(1);
              }}
              placeholder="— كل الفئات —"
            />
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Button
                variant={showLowStock ? 'warning' : 'outline'}
                size="sm"
                onClick={() => {
                  setShowLowStock((v) => !v);
                  setPage(1);
                }}
                className="flex-1"
              >
                <AlertTriangle className="size-4" />
                <span>{showLowStock ? 'إخفاء المخزون المنخفض' : 'المخزون المنخفض'}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <LoadingState />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="لا توجد منتجات"
          description="ابدأ بإضافة أول منتج للكتالوج"
          action={
            <RequirePermission permission="catalog.products.create">
              <Button asChild>
                <Link to="/catalog/products/new">
                  <Plus className="size-4" />
                  <span>إضافة منتج</span>
                </Link>
              </Button>
            </RequirePermission>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p: Product & { stock_level?: number }) => (
              <ProductCard key={p.id} product={p} onDelete={(id) => deleteMutation.mutateAsync(id)} />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
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
        </>
      )}
    </div>
  );
}

function ProductCard({
  product,
  onDelete,
}: {
  product: Product & { stock_level?: number };
  onDelete: (id: string) => Promise<unknown>;
}) {
  const typeMeta = TYPE_LABELS[product.type] ?? DEFAULT_TYPE_META;
  const TypeIcon = typeMeta.icon;
  const stockLevel = product.stock_level;
  const isLowStock = stockLevel !== undefined && stockLevel <= product.min_quantity;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-card">
      <Link to={`/catalog/products/${product.id}`}>
        <div className="aspect-square bg-muted/30">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Package className="size-12 text-muted-foreground" />
            </div>
          )}
        </div>
      </Link>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/catalog/products/${product.id}`} className="flex-1">
            <p className="line-clamp-1 font-medium hover:underline">{product.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
          </Link>
          <Badge variant={typeMeta.variant} className="shrink-0 text-[10px]">
            <TypeIcon className="size-2.5" />
            {typeMeta.label}
          </Badge>
        </div>

        {product.brand ? (
          <p className="text-xs text-muted-foreground">{product.brand} {product.model}</p>
        ) : null}

        <div className="flex items-center justify-between pt-1">
          <span className="font-bold text-primary">{formatCurrency(product.sale_price)}</span>
          {stockLevel !== undefined ? (
            <Badge
              variant={isLowStock ? 'destructive' : stockLevel > 0 ? 'success' : 'outline'}
              className="text-[10px]"
            >
              {isLowStock && stockLevel > 0 ? (
                <AlertTriangle className="size-2.5" />
              ) : null}
              {product.type === 'imei' ? `${stockLevel} جهاز` : `${stockLevel} ${product.unit}`}
            </Badge>
          ) : null}
        </div>

        <div className="flex gap-1 border-t pt-2">
          <RequirePermission permission="catalog.products.edit" fallback={null}>
            <Button asChild size="sm" variant="ghost" className="flex-1">
              <Link to={`/catalog/products/${product.id}/edit`}>
                <Pencil className="size-3.5" />
                <span>تعديل</span>
              </Link>
            </Button>
          </RequirePermission>
          <RequirePermission permission="catalog.products.delete" fallback={null}>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost" className="text-destructive" aria-label="حذف">
                  <Trash2 className="size-3.5" />
                </Button>
              }
              title="حذف المنتج"
              description={`هل أنت متأكد من حذف "${product.name}"؟`}
              confirmLabel="حذف"
              destructive
              onConfirm={async () => {
                await onDelete(product.id);
              }}
            />
          </RequirePermission>
        </div>
      </CardContent>
    </Card>
  );
}
