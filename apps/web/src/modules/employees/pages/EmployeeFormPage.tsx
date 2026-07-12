import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { BranchSelect } from '@components/data/BranchSelect';
import { employeesApi, useShifts } from '../api/employees.api';
import { useAuthStore } from '@stores/auth.store';

const isEdit = (p: string) => p.endsWith('/edit');

export default function EmployeeFormPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editMode = isEdit(location.pathname) && !!id;
  const user = useAuthStore((s) => s.user);
  const { data: shifts = [] } = useShifts();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['employee', id], queryFn: () => employeesApi.get(id!), enabled: editMode,
  });

  const [v, setV] = useState({
    branchId: '', code: '', fullName: '', nationalId: '' as string | null, phone: '' as string | null,
    address: '' as string | null, hireDate: new Date().toISOString().split('T')[0]!,
    position: '' as string | null, baseSalary: 0, allowances: 0, shiftId: '' as string | null,
    status: 'active' as 'active' | 'on_leave' | 'terminated',
  });

  useEffect(() => {
    if (existing) setV({
      branchId: existing.branch_id, code: existing.code, fullName: existing.full_name,
      nationalId: existing.national_id, phone: existing.phone, address: existing.address,
      hireDate: existing.hire_date, position: existing.position, baseSalary: existing.base_salary,
      allowances: existing.allowances, shiftId: existing.shift_id, status: existing.status as 'active' | 'on_leave' | 'terminated',
    });
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...v, nationalId: v.nationalId || null, phone: v.phone || null, address: v.address || null, position: v.position || null, shiftId: v.shiftId || null };
      if (editMode && id) return employeesApi.update(id, payload);
      return employeesApi.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); toast.success(editMode ? 'تم التحديث' : 'تم الإنشاء'); navigate('/employees'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (editMode && isLoading) return <LoadingState message="جارٍ تحميل الموظف…" />;

  return (
    <div className="page-container">
      <PageHeader title={editMode ? 'تعديل موظف' : 'إضافة موظف'} actions={<Button asChild variant="outline"><Link to="/employees"><ArrowRight className="size-4" /><span>العودة</span></Link></Button>} />
      <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="size-5" /> البيانات الأساسية</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>الاسم الكامل *</Label><Input required value={v.fullName} onChange={(e) => setV((p) => ({ ...p, fullName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الكود *</Label><Input required value={v.code} onChange={(e) => setV((p) => ({ ...p, code: e.target.value.toUpperCase() }))} className="font-mono" /></div>
            <div className="space-y-2"><Label>الرقم القومي</Label><Input value={v.nationalId ?? ''} onChange={(e) => setV((p) => ({ ...p, nationalId: e.target.value || null }))} dir="ltr" maxLength={14} /></div>
            <div className="space-y-2"><Label>الهاتف</Label><Input value={v.phone ?? ''} onChange={(e) => setV((p) => ({ ...p, phone: e.target.value || null }))} dir="ltr" /></div>
            <div className="space-y-2"><Label>المنصب</Label><Input value={v.position ?? ''} onChange={(e) => setV((p) => ({ ...p, position: e.target.value || null }))} placeholder="مثال: فني صيانة" /></div>
            <div className="space-y-2"><Label>الفرع *</Label><BranchSelect value={v.branchId} onChange={(val) => setV((p) => ({ ...p, branchId: val ?? '' }))} /></div>
            <div className="space-y-2"><Label>تاريخ التعيين *</Label><Input type="date" required value={v.hireDate} onChange={(e) => setV((p) => ({ ...p, hireDate: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الوردية</Label>
              <select value={v.shiftId ?? ''} onChange={(e) => setV((p) => ({ ...p, shiftId: e.target.value || null }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
                <option value="">— بدون وردية —</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>الراتب الأساسي</Label><Input type="number" step="0.01" min="0" value={v.baseSalary} onChange={(e) => setV((p) => ({ ...p, baseSalary: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>البدلات</Label><Input type="number" step="0.01" min="0" value={v.allowances} onChange={(e) => setV((p) => ({ ...p, allowances: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>الحالة</Label>
              <select value={v.status} onChange={(e) => setV((p) => ({ ...p, status: e.target.value as 'active' | 'on_leave' | 'terminated' }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring">
                <option value="active">نشط</option>
                <option value="on_leave">في إجازة</option>
                <option value="terminated">منتهي</option>
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>العنوان</Label><Input value={v.address ?? ''} onChange={(e) => setV((p) => ({ ...p, address: e.target.value || null }))} /></div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline"><Link to="/employees">إلغاء</Link></Button>
          <Button type="submit" loading={saveMutation.isPending}><Save className="size-4" /><span>{editMode ? 'حفظ' : 'إنشاء'}</span></Button>
        </div>
      </form>
      {void user}
    </div>
  );
}
