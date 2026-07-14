import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Package, Upload, X } from 'lucide-react';
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
  Switch,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { CategorySelect } from '@components/data/CategorySelect';
import { BranchSelect } from '@components/data/BranchSelect';
import { productsApi } from '../api/catalog.api';
import type { ProductType } from '@mobile-shop/shared';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

const TYPE_OPTIONS: Array<{ value: ProductType; label: string }> = [
  { value: 'standard', label: 'قياسي' },
  { value: 'service', label: 'خدمة' },
];

export default function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEditMode(location.pathname) && !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: editMode,
  });

  const [values, setValues] = useState({
    name: '',
    barcode: '' as string | null,
    categoryId: '' as string | null,
    branchId: '' as string | null,
    type: 'standard' as ProductType,
    costPrice: 0,
    salePrice: 0,
    quantity: 0,
    minQuantity: 0,
    imageUrl: null as string | null,
    isActive: true,
  });

  useEffect(() => {
    if (existing) {
      setValues({
        name: existing.name,
        barcode: existing.barcode,
        categoryId: existing.category_id,
        branchId: existing.branch_id ?? null,
        type: existing.type,
        costPrice: existing.cost_price,
        salePrice: existing.sale_price,
        quantity: existing.stock_levels?.[0]?.quantity ?? 0,
        minQuantity: existing.min_quantity,
        imageUrl: existing.image_url,
        isActive: existing.is_active,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Auto-generate SKU from product name
      const sku = values.name
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 20) || `PRD-${Date.now().toString(36).toUpperCase()}`;

      const payload = {
        sku,
        name: values.name,
        barcode: values.barcode || null,
        categoryId: values.categoryId || null,
        branchId: values.branchId || null,
        type: values.type,
        unit: 'piece',
        costPrice: values.costPrice,
        salePrice: values.salePrice,
        taxRate: 14,
        minQuantity: values.minQuantity,
        hasWarranty: false,
        warrantyDays: 0,
        imageUrl: values.imageUrl,
        isActive: values.isActive,
      };
      if (editMode && id) {
        return productsApi.update(id, payload);
      }
      return productsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(editMode ? 'تم تحديث المنتج' : 'تم إنشاء المنتج');
      navigate('/catalog/products');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('حجم الصورة يجب ألا يتجاوز 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setValues((v) => ({ ...v, imageUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const update = <K extends keyof typeof values>(key: K, val: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل المنتج…" />;

  return (
    <div className="page-container">
      <PageHeader
        title={editMode ? 'تعديل منتج' : 'إضافة منتج جديد'}
        description={editMode ? existing?.name : 'أنشئ منتجاً جديداً بسهولة'}
        actions={
          <Button asChild variant="outline">
            <Link to="/catalog/products">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!values.name.trim()) {
            toast.error('اسم المنتج مطلوب');
            return;
          }
          saveMutation.mutate();
        }}
        className="space-y-6"
      >
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" />
              البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[160px_1fr]">
            {/* Image */}
            <div className="space-y-2">
              <Label>صورة المنتج</Label>
              <div className="relative aspect-square overflow-hidden rounded-lg border-2 border-dashed border-input bg-muted/30">
                {values.imageUrl ? (
                  <>
                    <img src={values.imageUrl} alt="معاينة" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => update('imageUrl', null)}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow hover:bg-background"
                    >
                      <X className="size-4 text-destructive" />
                    </button>
                  </>
                ) : (
                  <label className="flex size-full cursor-pointer flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50">
                    <Upload className="size-6" />
                    <span className="text-xs">رفع صورة</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">اسم المنتج *</Label>
                <Input
                  id="name"
                  required
                  value={values.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="مثال: iPhone 15 Pro Max 256GB"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">باركود</Label>
                <Input
                  id="barcode"
                  value={values.barcode ?? ''}
                  onChange={(e) => update('barcode', e.target.value || null)}
                  placeholder="يُولّد تلقائياً إن تُرك فارغاً"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoryId">الفئة</Label>
                <CategorySelect
                  value={values.categoryId}
                  onChange={(v) => update('categoryId', v)}
                  placeholder="— بدون فئة —"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchId">الفرع</Label>
                <BranchSelect
                  value={values.branchId}
                  onChange={(v) => update('branchId', v)}
                  placeholder="— كل الفروع —"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>نوع المنتج</Label>
                <div className="flex gap-2">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update('type', opt.value)}
                      className={`flex-1 rounded-md border px-4 py-2 text-center text-sm transition-colors ${
                        values.type === opt.value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-input hover:bg-muted/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Stock */}
        <Card>
          <CardHeader>
            <CardTitle>التسعير والمخزون</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="costPrice">سعر التكلفة</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.costPrice}
                  onChange={(e) => update('costPrice', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salePrice">سعر البيع *</Label>
                <Input
                  id="salePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={values.salePrice}
                  onChange={(e) => update('salePrice', Number(e.target.value))}
                />
              </div>
              {values.type !== 'service' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">الكمية</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      value={values.quantity}
                      onChange={(e) => update('quantity', Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minQuantity">حد التنبيه للمخزون المنخفض</Label>
                    <Input
                      id="minQuantity"
                      type="number"
                      min="0"
                      value={values.minQuantity}
                      onChange={(e) => update('minQuantity', Number(e.target.value))}
                    />
                  </div>
                </>
              ) : null}
              <Label className="flex items-center gap-2">
                <Switch
                  checked={values.isActive}
                  onCheckedChange={(v) => update('isActive', v)}
                />
                <span>نشط (متاح للبيع)</span>
              </Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/catalog/products">إلغاء</Link>
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            <Save className="size-4" />
            <span>{editMode ? 'حفظ التعديلات' : 'إنشاء المنتج'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
