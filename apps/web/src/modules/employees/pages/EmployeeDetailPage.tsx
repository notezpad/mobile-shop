/**
 * Employee detail page — info + performance stats.
 */
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, Pencil, User, Phone, MapPin, Briefcase, Calendar, TrendingUp, Wrench, Wallet } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useEmployee } from '../api/employees.api';
import { formatCurrency, formatNumber } from '@core/utils/format';
import { formatDate } from '@core/utils/date';

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  active: { label: 'نشط', variant: 'success' },
  on_leave: { label: 'في إجازة', variant: 'warning' },
  terminated: { label: 'منتهي', variant: 'destructive' },
};

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: emp, isLoading } = useEmployee(id);

  if (isLoading || !emp) return <LoadingState message="جارٍ تحميل الموظف…" />;
  const st = STATUS_LABELS[emp.status] ?? { label: '—', variant: 'secondary' as const };

  return (
    <div className="page-container">
      <PageHeader
        title={emp.full_name}
        description={emp.code}
        actions={
          <>
            <Button asChild variant="outline"><Link to="/employees"><ArrowRight className="size-4" /><span>العودة</span></Link></Button>
            <RequirePermission permission="employees.edit">
              <Button asChild><Link to={`/employees/${emp.id}/edit`}><Pencil className="size-4" /><span>تعديل</span></Link></Button>
            </RequirePermission>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <Badge variant={st.variant} className="text-sm">{st.label}</Badge>
        {emp.position ? <Badge variant="secondary">{emp.position}</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Personal info */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="size-4" /> البيانات الشخصية</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow icon={<Phone className="size-4" />} label="الهاتف" value={emp.phone ?? '—'} dir="ltr" />
            <DetailRow icon={<MapPin className="size-4" />} label="العنوان" value={emp.address ?? '—'} />
            <DetailRow icon={<Calendar className="size-4" />} label="تاريخ التعيين" value={formatDate(emp.hire_date)} />
            {emp.national_id ? <DetailRow label="الرقم القومي" value={emp.national_id} dir="ltr" /> : null}
            {emp.user_username ? <DetailRow label="حساب المستخدم" value={emp.user_username} /> : null}
          </CardContent>
        </Card>

        {/* Employment info */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Briefcase className="size-4" /> بيانات الوظيفة</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="الفرع" value={emp.branch_name ?? '—'} />
            <DetailRow label="المنصب" value={emp.position ?? '—'} />
            <DetailRow label="الوردية" value={emp.shift_name ? `${emp.shift_name} (${emp.shift_start_time} - ${emp.shift_end_time})` : '—'} />
            <DetailRow icon={<Wallet className="size-4" />} label="الراتب الأساسي" value={formatCurrency(emp.base_salary)} />
            <DetailRow label="البدلات" value={formatCurrency(emp.allowances)} />
            <div className="flex justify-between border-t pt-2 font-bold">
              <span>الإجمالي</span>
              <span className="tabular-nums text-primary">{formatCurrency(emp.base_salary + emp.allowances)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Performance */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="size-4" /> الأداء</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="size-3" /> مبيعات</span>
              <span className="font-bold">{formatNumber(emp.sales_count ?? 0, 0)} فاتورة</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">إجمالي المبيعات</span>
              <span className="font-bold tabular-nums">{formatCurrency(emp.sales_total ?? 0)}</span>
            </div>
            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><Wrench className="size-3" /> صيانات</span>
              <span className="font-bold">{formatNumber(emp.repairs_count ?? 0, 0)} تذكرة</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">إيراد الصيانة</span>
              <span className="font-bold tabular-nums">{formatCurrency(emp.repairs_revenue ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, dir }: { icon?: React.ReactNode; label: string; value: string; dir?: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium" dir={dir}>{value}</span>
    </div>
  );
}
