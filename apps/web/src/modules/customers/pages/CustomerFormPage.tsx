import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, User } from 'lucide-react';
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
import { customersApi } from '../api/customers.api';

const isEditMode = (pathname: string) => pathname.endsWith('/edit');

export default function CustomerFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEditMode(location.pathname) && !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id!),
    enabled: editMode,
  });

  const [values, setValues] = useState({
    name: '',
    code: '' as string | null,
    phone: '' as string | null,
    email: '' as string | null,
    address: '' as string | null,
    taxNumber: '' as string | null,
    creditLimit: 0,
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
        taxNumber: existing.tax_number,
        creditLimit: existing.credit_limit,
        notes: existing.notes,
        isActive: existing.is_active,
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...values,
        code: values.code || null,
        phone: values.phone || null,
        email: values.email || null,
        address: values.address || null,
        taxNumber: values.taxNumber || null,
        notes: values.notes || null,
      };
      if (editMode && id) {
        return customersApi.update(id, payload);
      }
      return customersApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(editMode ? 'تم تحديث العميل' : 'تم إنشاء العميل');
      navigate('/customers');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = <K extends keyof typeof values>(key: K, val: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل العميل…" />;

  return (
    <div className="page-container">
      <PageHeader
        title={editMode ? 'تعديل عميل' : 'إضافة عميل جديد'}
        description={editMode ? existing?.name : 'أنشئ ملف عميل جديد'}
        actions={
          <Button asChild variant="outline">
            <Link to="/customers">
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
              <User className="size-5" />
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
                placeholder="مثال: أحمد محمد"
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
              <Label htmlFor="code">الكود (اختياري)</Label>
              <Input
                id="code"
                value={values.code ?? ''}
                onChange={(e) => update('code', e.target.value || null)}
                placeholder="يُولّد تلقائياً إن تُرك فارغاً"
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
                placeholder="customer@example.com"
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
            <div className="space-y-2">
              <Label htmlFor="taxNumber">الرقم الضريبي</Label>
              <Input
                id="taxNumber"
                value={values.taxNumber ?? ''}
                onChange={(e) => update('taxNumber', e.target.value || null)}
                placeholder="312-XXX-XXX"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditLimit">حد الائتمان</Label>
              <Input
                id="creditLimit"
                type="number"
                step="0.01"
                min="0"
                value={values.creditLimit}
                onChange={(e) => update('creditLimit', Number(e.target.value))}
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
            <Link to="/customers">إلغاء</Link>
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            <Save className="size-4" />
            <span>{editMode ? 'حفظ التعديلات' : 'إنشاء العميل'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
