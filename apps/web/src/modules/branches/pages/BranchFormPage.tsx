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
import { branchesApi } from '../api/branches.api';
import { toast } from 'sonner';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

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

  const [values, setValues] = useState({
    name: '',
    code: '',
    address: null as string | null,
    phone: null as string | null,
    isActive: true,
  });

  useEffect(() => {
    if (existingBranch) {
      setValues({
        name: existingBranch.name,
        code: existingBranch.code,
        address: existingBranch.address ?? null,
        phone: existingBranch.phone ?? null,
        isActive: existingBranch.is_active,
      });
    }
  }, [existingBranch]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Use default settings for new branches
      const settings = {
        taxRate: 14,
        currency: 'EGP',
        receiptHeader: null,
        receiptFooter: null,
        lowStockThreshold: 5,
        enableVatInvoice: true,
        vatNumber: null,
        printerType: 'a4' as const,
        printerName: null,
      };

      const payload = {
        name: values.name,
        code: values.code,
        address: values.address,
        phone: values.phone,
        email: null,
        isMain: false,
        isActive: values.isActive,
        settings,
      };

      if (editMode && id) {
        return branchesApi.update(id, payload);
      }
      return branchesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast.success(editMode ? 'تم تحديث الفرع' : 'تم إنشاء الفرع');
      navigate('/branches');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = <K extends keyof typeof values>(key: K, val: typeof values[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل بيانات الفرع…" />;

  return (
    <div className="page-container">
      <PageHeader
        title={editMode ? 'تعديل فرع' : 'إضافة فرع جديد'}
        description={editMode ? existingBranch?.name : 'أنشئ فرعاً جديداً بسهولة'}
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
          if (!values.name.trim()) {
            toast.error('اسم الفرع مطلوب');
            return;
          }
          if (!values.code.trim()) {
            toast.error('كود الفرع مطلوب');
            return;
          }
          saveMutation.mutate();
        }}
        className="space-y-6"
      >
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
    </div>
  );
}
