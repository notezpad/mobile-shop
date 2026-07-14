import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { BranchSelect } from '@components/data/BranchSelect';
import { employeesApi } from '../api/employees.api';

const isEdit = (p: string) => p.endsWith('/edit');

export default function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEdit(location.pathname) && !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ['employee', id], queryFn: () => employeesApi.get(id!), enabled: editMode,
  });

  const [v, setV] = useState({
    branchId: '', code: '', fullName: '', phone: '' as string | null,
    position: '' as string | null, baseSalary: 0,
    status: 'active' as 'active' | 'on_leave' | 'terminated',
  });

  useEffect(() => {
    if (existing) setV({
      branchId: existing.branch_id, code: existing.code, fullName: existing.full_name,
      phone: existing.phone, position: existing.position, baseSalary: existing.base_salary,
      status: existing.status as 'active' | 'on_leave' | 'terminated',
    });
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...v,
        phone: v.phone || null,
        position: v.position || null,
        nationalId: null,
        address: null,
        hireDate: new Date().toISOString().split('T')[0],
        allowances: 0,
        shiftId: null,
      };
      if (editMode && id) return employeesApi.update(id, payload);
      return employeesApi.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); toast.success(editMode ? 'تم التحديث' : 'تم الإنشاء'); navigate('/employees'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل الموظف…" />;

  return (
    <div className="page-container">
      <PageHeader title={editMode ? 'تعديل موظف' : 'إضافة موظف'} description="بيانات الموظف الأساسية"
        actions={<Button asChild variant="outline"><Link to="/employees"><ArrowRight className="size-4" /><span>العودة</span></Link></Button>} />
      <form onSubmit={(e) => { e.preventDefault(); 
        if (!v.fullName.trim()) { toast.error('الاسم مطلوب'); return; }
        saveMutation.mutate(); 
      }} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="size-5" /> البيانات الأساسية</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>الاسم الكامل *</Label><Input required value={v.fullName} onChange={(e) => setV((p) => ({ ...p, fullName: e.target.value }))} placeholder="مثال: أحمد محمد" /></div>
            <div className="space-y-2"><Label>الكود *</Label><Input required value={v.code} onChange={(e) => setV((p) => ({ ...p, code: e.target.value.toUpperCase() }))} className="font-mono" placeholder="EMP-001" /></div>
            <div className="space-y-2"><Label>الهاتف</Label><Input value={v.phone ?? ''} onChange={(e) => setV((p) => ({ ...p, phone: e.target.value || null }))} dir="ltr" placeholder="01XXXXXXXXX" /></div>
            <div className="space-y-2"><Label>المنصب</Label><Input value={v.position ?? ''} onChange={(e) => setV((p) => ({ ...p, position: e.target.value || null }))} placeholder="مثال: فني صيانة" /></div>
            <div className="space-y-2"><Label>الفرع *</Label><BranchSelect value={v.branchId} onChange={(val) => setV((p) => ({ ...p, branchId: val ?? '' }))} /></div>
            <div className="space-y-2"><Label>الراتب الأساسي</Label><Input type="number" step="0.01" min="0" value={v.baseSalary} onChange={(e) => setV((p) => ({ ...p, baseSalary: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>الحالة</Label>
              <select value={v.status} onChange={(e) => setV((p) => ({ ...p, status: e.target.value as 'active' | 'on_leave' | 'terminated' }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
                <option value="active">نشط</option>
                <option value="on_leave">في إجازة</option>
                <option value="terminated">منتهي</option>
              </select>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline"><Link to="/employees">إلغاء</Link></Button>
          <Button type="submit" loading={saveMutation.isPending}><Save className="size-4" /><span>{editMode ? 'حفظ' : 'إنشاء'}</span></Button>
        </div>
      </form>
    </div>
  );
}
