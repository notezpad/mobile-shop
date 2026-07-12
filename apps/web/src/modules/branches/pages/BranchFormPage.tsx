import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Building2 } from 'lucide-react';
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
import { createBranchSchema, updateBranchSchema } from '@mobile-shop/shared';
import type {
  CreateBranchInput,
  UpdateBranchInput,
  BranchSettings,
  Branch,
} from '@mobile-shop/shared';
import { branchesApi } from '../api/branches.api';
import { toast } from 'sonner';
import { z } from 'zod';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

const formSchema = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب'),
  code: z.string().trim().min(2, 'الكود مطلوب').regex(/^[A-Z0-9-]+$/i, 'أحرف إنجليزية وأرقام'),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isMain: z.boolean(),
  isActive: z.boolean(),
  // Settings
  taxRate: z.coerce.number().min(0).max(100),
  currency: z.string().min(2).max(5),
  receiptHeader: z.string().nullable(),
  receiptFooter: z.string().nullable(),
  lowStockThreshold: z.coerce.number().int().min(0),
  enableVatInvoice: z.boolean(),
  vatNumber: z.string().nullable(),
  printerType: z.enum(['thermal_80', 'thermal_58', 'a4', 'none']),
  printerName: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function BranchFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEditMode(location.pathname) && !!id;

  const { data: existingBranch, isLoading } = useQuery({
    queryKey: ['branch', id],
    queryFn: () => branchesApi.get(id!),
    enabled: editMode,
  });

  const [values, setValues] = useState<FormValues>({
    name: '',
    code: '',
    address: null,
    phone: null,
    email: null,
    isMain: false,
    isActive: true,
    taxRate: 14,
    currency: 'EGP',
    receiptHeader: null,
    receiptFooter: null,
    lowStockThreshold: 5,
    enableVatInvoice: true,
    vatNumber: null,
    printerType: 'a4',
    printerName: null,
  });

  // Sync state when branch loads.
  useEffect(() => {
    if (existingBranch) {
      const s = (existingBranch.settings as BranchSettings) ?? {};
      setValues({
        name: existingBranch.name,
        code: existingBranch.code,
        address: existingBranch.address ?? null,
        phone: existingBranch.phone ?? null,
        email: existingBranch.email ?? null,
        isMain: existingBranch.is_main,
        isActive: existingBranch.is_active,
        taxRate: s.taxRate ?? 14,
        currency: s.currency ?? 'EGP',
        receiptHeader: s.receiptHeader ?? null,
        receiptFooter: s.receiptFooter ?? null,
        lowStockThreshold: s.lowStockThreshold ?? 5,
        enableVatInvoice: s.enableVatInvoice ?? true,
        vatNumber: s.vatNumber ?? null,
        printerType: s.printerType ?? 'a4',
        printerName: s.printerName ?? null,
      });
    }
  }, [existingBranch]);

  const saveMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const settings: BranchSettings = {
        taxRate: v.taxRate,
        currency: v.currency,
        receiptHeader: v.receiptHeader,
        receiptFooter: v.receiptFooter,
        lowStockThreshold: v.lowStockThreshold,
        enableVatInvoice: v.enableVatInvoice,
        vatNumber: v.vatNumber,
        printerType: v.printerType,
        printerName: v.printerName,
      };

      if (editMode && id) {
        const update: UpdateBranchInput = {
          name: v.name,
          code: v.code,
          address: v.address,
          phone: v.phone,
          email: v.email,
          isMain: v.isMain,
          isActive: v.isActive,
          settings,
        };
        return branchesApi.update(id, update);
      }

      const create: CreateBranchInput = {
        name: v.name,
        code: v.code,
        address: v.address,
        phone: v.phone,
        email: v.email,
        isMain: v.isMain,
        isActive: v.isActive,
        settings,
      };
      return branchesApi.create(create);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast.success(editMode ? 'تم تحديث الفرع' : 'تم إنشاء الفرع');
      navigate('/branches');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = <K extends keyof FormValues>(key: K, val: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل بيانات الفرع…" />;

  return (
    <div className="page-container">
      <PageHeader
        title={editMode ? 'تعديل فرع' : 'إضافة فرع جديد'}
        description={editMode ? existingBranch?.name : 'أنشئ فرعاً جديداً (متجر / مبيعات)'}
        actions={
          <Button asChild variant="outline">
            <Link to="/branches">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const result = formSchema.safeParse(values);
          if (!result.success) {
            const firstError = result.error.issues[0];
            toast.error(firstError?.message ?? 'بيانات غير صحيحة');
            return;
          }
          saveMutation.mutate(result.data);
        }}
        className="space-y-6"
      >
        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-5" />
              البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">اسم الفرع *</Label>
              <Input
                id="name"
                value={values.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="مثال: الفرع الرئيسي - مدينة نصر"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">كود الفرع *</Label>
              <Input
                id="code"
                value={values.code}
                onChange={(e) => update('code', e.target.value.toUpperCase())}
                placeholder="مثال: BR-001"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">أحرف إنجليزية وأرقام فقط.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">العنوان</Label>
              <Input
                id="address"
                value={values.address ?? ''}
                onChange={(e) => update('address', e.target.value || null)}
                placeholder="العنوان التفصيلي للفرع"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input
                id="phone"
                value={values.phone ?? ''}
                onChange={(e) => update('phone', e.target.value || null)}
                placeholder="01XXXXXXXXX"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={values.email ?? ''}
                onChange={(e) => update('email', e.target.value || null)}
                placeholder="branch@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.isMain}
                  onChange={(e) => update('isMain', e.target.checked)}
                  className="size-4 accent-primary"
                />
                <span>الفرع الرئيسي</span>
              </Label>
              <p className="text-xs text-muted-foreground">
                يمكن أن يكون فرع واحد فقط هو الرئيسي. سيتم إلغاء تعيين الفرع الرئيسي الحالي.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.isActive}
                  onChange={(e) => update('isActive', e.target.checked)}
                  className="size-4 accent-primary"
                />
                <span>نشط</span>
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Financial settings */}
        <Card>
          <CardHeader>
            <CardTitle>الإعدادات المالية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
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
            <div className="space-y-2">
              <Label htmlFor="currency">العملة</Label>
              <Input
                id="currency"
                value={values.currency}
                onChange={(e) => update('currency', e.target.value.toUpperCase())}
                placeholder="EGP"
                maxLength={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">حد التنبيه للمخزون المنخفض</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                min="0"
                value={values.lowStockThreshold}
                onChange={(e) => update('lowStockThreshold', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.enableVatInvoice}
                  onChange={(e) => update('enableVatInvoice', e.target.checked)}
                  className="size-4 accent-primary"
                />
                <span>تفعيل فاتورة ضريبية (VAT)</span>
              </Label>
            </div>
            {values.enableVatInvoice ? (
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="vatNumber">الرقم الضريبي (VAT Number)</Label>
                <Input
                  id="vatNumber"
                  value={values.vatNumber ?? ''}
                  onChange={(e) => update('vatNumber', e.target.value || null)}
                  placeholder="312-XXX-XXX"
                  dir="ltr"
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Receipt / Printer settings */}
        <Card>
          <CardHeader>
            <CardTitle>إعدادات الفاتورة والطابعة</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="printerType">نوع الطابعة</Label>
              <select
                id="printerType"
                value={values.printerType}
                onChange={(e) => update('printerType', e.target.value as FormValues['printerType'])}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
              >
                <option value="a4">A4 (عادي)</option>
                <option value="thermal_80">حرارية 80mm</option>
                <option value="thermal_58">حرارية 58mm</option>
                <option value="none">بدون طابعة</option>
              </select>
            </div>
            {values.printerType !== 'none' ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="printerName">اسم الطابعة (اختياري)</Label>
                <Input
                  id="printerName"
                  value={values.printerName ?? ''}
                  onChange={(e) => update('printerName', e.target.value || null)}
                  placeholder="مثال: EPSON-TM-T20"
                  dir="ltr"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="receiptHeader">رأس الفاتورة (اختياري)</Label>
              <textarea
                id="receiptHeader"
                value={values.receiptHeader ?? ''}
                onChange={(e) => update('receiptHeader', e.target.value || null)}
                placeholder="شكراً لزيارتكم"
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiptFooter">تذييل الفاتورة (اختياري)</Label>
              <textarea
                id="receiptFooter"
                value={values.receiptFooter ?? ''}
                onChange={(e) => update('receiptFooter', e.target.value || null)}
                placeholder="نتمنى لكم يوماً سعيداً"
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/branches">إلغاء</Link>
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            <Save className="size-4" />
            <span>{editMode ? 'حفظ التعديلات' : 'إنشاء الفرع'}</span>
          </Button>
        </div>
      </form>

      {/* unused schema refs — kept for type parity */}
      {void createBranchSchema}
      {void updateBranchSchema}
      {void ((b: Branch) => b)(existingBranch as Branch)}
    </div>
  );
}
