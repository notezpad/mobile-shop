import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Truck } from 'lucide-react';
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
import { LoadingState } from '@components/feedback/LoadingState';
import { suppliersApi } from '../api/suppliers.api';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

export default function SupplierFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEditMode(location.pathname) && !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => suppliersApi.get(id!),
    enabled: editMode,
  });

  const [values, setValues] = useState({
    name: '',
    code: '',
    phone: '' as string | null,
    email: '' as string | null,
    address: '' as string | null,
    notes: '' as string | null,
    isActive: true,
  });

  useEffect(() => {
    if (existing) {
      setValues({
        name: existing.name,
        code: existing.code,
        phone: existing.phone,
        email: existing.email,
        address: existing.address,
        notes: existing.notes,
        isActive: existing.is_active,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...values,
        phone: values.phone || null,
        email: values.email || null,
        address: values.address || null,
        notes: values.notes || null,
      };
      if (editMode && id) {
        return suppliersApi.update(id, payload);
      }
      return suppliersApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(editMode ? 'تم تحديث المورد' : 'تم إنشاء المورد');
      navigate('/suppliers');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = <K extends keyof typeof values>(key: K, val: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل المورد…" />;

  return (
    <div className="page-container">
      <PageHeader
        title={editMode ? 'تعديل مورد' : 'إضافة مورد جديد'}
        description={editMode ? existing?.name : 'أنشئ ملف مورد جديد'}
        actions={
          <Button asChild variant="outline">
            <Link to="/suppliers">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!values.name.trim() || !values.code.trim()) {
            toast.error('الاسم والكود مطلوبان');
            return;
          }
          saveMutation.mutate();
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-5" />
              البيانات الأساسية
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم *</Label>
              <Input
                id="name"
                required
                value={values.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="مثال: شركة الإتصالات الحديثة"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">الكود *</Label>
              <Input
                id="code"
                required
                value={values.code}
                onChange={(e) => update('code', e.target.value.toUpperCase())}
                placeholder="SUP-001"
                dir="ltr"
                className="font-mono"
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
                placeholder="supplier@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">العنوان</Label>
              <Textarea
                id="address"
                value={values.address ?? ''}
                onChange={(e) => update('address', e.target.value || null)}
                rows={2}
                placeholder="العنوان التفصيلي"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={values.notes ?? ''}
                onChange={(e) => update('notes', e.target.value || null)}
                rows={2}
                placeholder="ملاحظات داخلية"
              />
            </div>
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(e) => update('isActive', e.target.checked)}
                className="size-4 accent-primary"
              />
              <span>نشط</span>
            </Label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/suppliers">إلغاء</Link>
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            <Save className="size-4" />
            <span>{editMode ? 'حفظ التعديلات' : 'إنشاء المورد'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
