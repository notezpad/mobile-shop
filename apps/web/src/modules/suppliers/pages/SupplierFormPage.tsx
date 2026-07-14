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
    phone: '' as string | null,
    notes: '' as string | null,
    isActive: true,
  });

  useEffect(() => {
    if (existing) {
      setValues({
        name: existing.name,
        phone: existing.phone,
        notes: existing.notes,
        isActive: existing.is_active,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // Auto-generate code from name
      const code = values.name
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 15) || `SUP-${Date.now().toString(36).toUpperCase()}`;

      const payload = {
        name: values.name,
        code,
        phone: values.phone || null,
        email: null,
        address: null,
        notes: values.notes || null,
        isActive: values.isActive,
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
        description={editMode ? existing?.name : 'أنشئ ملف مورد جديد بسهولة'}
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
          if (!values.name.trim()) {
            toast.error('الاسم مطلوب');
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
              <Label htmlFor="phone">الهاتف</Label>
              <Input
                id="phone"
                value={values.phone ?? ''}
                onChange={(e) => update('phone', e.target.value || null)}
                placeholder="01XXXXXXXXX"
                dir="ltr"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Input
                id="notes"
                value={values.notes ?? ''}
                onChange={(e) => update('notes', e.target.value || null)}
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
