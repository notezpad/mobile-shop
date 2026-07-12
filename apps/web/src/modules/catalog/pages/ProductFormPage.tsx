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
  Textarea,
  Badge,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { CategorySelect } from '@components/data/CategorySelect';
import { productsApi } from '../api/catalog.api';
import type { ProductType } from '@mobile-shop/shared';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

const TYPE_OPTIONS: Array<{ value: ProductType; label: string; description: string }> = [
  { value: 'standard', label: 'قياسي', description: 'منتج عادي تتبعه الكمية' },
  { value: 'imei', label: 'IMEI', description: 'جهاز يُتبّع بالـ IMEI (وحدة لكل جهاز)' },
  { value: 'service', label: 'خدمة', description: 'خدمة بدون مخزون (مثل أجرة تركيب)' },
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
    sku: '',
    barcode: '' as string | null,
    name: '',
    nameAr: '' as string | null,
    categoryId: '' as string | null,
    brand: '' as string | null,
    model: '' as string | null,
    description: '' as string | null,
    type: 'standard' as ProductType,
    unit: 'piece',
    costPrice: 0,
    salePrice: 0,
    wholesalePrice: null as number | null,
    taxRate: 14,
    minQuantity: 0,
    hasWarranty: false,
    warrantyDays: 0,
    imageUrl: null as string | null,
    isActive: true,
  });

  useEffect(() => {
    if (existing) {
      setValues({
        sku: existing.sku,
        barcode: existing.barcode,
        name: existing.name,
        nameAr: existing.name_ar,
        categoryId: existing.category_id,
        brand: existing.brand,
        model: existing.model,
        description: existing.description,
        type: existing.type,
        unit: existing.unit,
        costPrice: existing.cost_price,
        salePrice: existing.sale_price,
        wholesalePrice: existing.wholesale_price,
        taxRate: existing.tax_rate,
        minQuantity: existing.min_quantity,
        hasWarranty: existing.has_warranty,
        warrantyDays: existing.warranty_days,
        imageUrl: existing.image_url,
        isActive: existing.is_active,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...values,
        categoryId: values.categoryId || null,
        barcode: values.barcode || null,
        nameAr: values.nameAr || null,
        brand: values.brand || null,
        model: values.model || null,
        description: values.description || null,
        wholesalePrice: values.wholesalePrice ?? null,
        imageUrl: values.imageUrl,
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
        description={editMode ? existing?.name : 'أنشئ منتجاً جديداً في الكتالوج'}
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
          saveMutation.mutate();
        }}
        className="space-y-6"
      >
        {/* Image upload + basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" />
              البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[200px_1fr]">
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
                    <Upload className="size-8" />
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
              <p className="text-[10px] text-muted-foreground">حجم أقصى 2MB. JPG/PNG/WebP.</p>
            </div>

            {/* Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
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
                <Label htmlFor="nameAr">الاسم بالعربية</Label>
                <Input
                  id="nameAr"
                  value={values.nameAr ?? ''}
                  onChange={(e) => update('nameAr', e.target.value || null)}
                  placeholder="آيفون 15 برو ماكس 256 جيجا"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  required
                  value={values.sku}
                  onChange={(e) => update('sku', e.target.value.toUpperCase())}
                  placeholder="IP15-PM-256"
                  className="font-mono"
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="categoryId">الفئة</Label>
                <CategorySelect
                  value={values.categoryId}
                  onChange={(v) => update('categoryId', v)}
                  placeholder="— بدون فئة —"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">العلامة التجارية</Label>
                <Input
                  id="brand"
                  value={values.brand ?? ''}
                  onChange={(e) => update('brand', e.target.value || null)}
                  placeholder="Apple"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">الموديل</Label>
                <Input
                  id="model"
                  value={values.model ?? ''}
                  onChange={(e) => update('model', e.target.value || null)}
                  placeholder="A2849"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  value={values.description ?? ''}
                  onChange={(e) => update('description', e.target.value || null)}
                  rows={3}
                  placeholder="وصف موجز للمنتج"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Type + pricing */}
        <Card>
          <CardHeader>
            <CardTitle>النوع والتسعير</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>نوع المنتج</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update('type', opt.value)}
                    className={`rounded-md border p-3 text-right transition-colors ${
                      values.type === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input hover:bg-muted/50'
                    }`}
                  >
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="costPrice">سعر التكلفة *</Label>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  required
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
              <div className="space-y-2">
                <Label htmlFor="wholesalePrice">سعر الجملة</Label>
                <Input
                  id="wholesalePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.wholesalePrice ?? ''}
                  onChange={(e) =>
                    update('wholesalePrice', e.target.value ? Number(e.target.value) : null)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRate">نسبة الضريبة (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={values.taxRate}
                  onChange={(e) => update('taxRate', Number(e.target.value))}
                />
              </div>
              {values.type !== 'service' ? (
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
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="unit">وحدة القياس</Label>
                <Input
                  id="unit"
                  value={values.unit}
                  onChange={(e) => update('unit', e.target.value)}
                  placeholder="piece"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Label className="flex items-center gap-2">
                <Switch
                  checked={values.hasWarranty}
                  onCheckedChange={(v) => update('hasWarranty', v)}
                />
                <span>له ضمان</span>
              </Label>
              {values.hasWarranty ? (
                <div className="space-y-2">
                  <Label htmlFor="warrantyDays">مدة الضمان (يوم)</Label>
                  <Input
                    id="warrantyDays"
                    type="number"
                    min="0"
                    value={values.warrantyDays}
                    onChange={(e) => update('warrantyDays', Number(e.target.value))}
                  />
                </div>
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

      {/* unused — keep for type parity */}
      {void Badge}
    </div>
  );
}
