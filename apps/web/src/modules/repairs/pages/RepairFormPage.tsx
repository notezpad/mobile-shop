/**
 * Repair create form — receive a device for repair.
 * Simplified form: customer, device info, problem, costs.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Smartphone } from 'lucide-react';
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
import { CustomerSelect } from '@components/data/CustomerSelect';
import { BranchSelect } from '@components/data/BranchSelect';
import { useAuthStore } from '@stores/auth.store';
import { repairsApi } from '../api/repairs.api';

export default function RepairFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [values, setValues] = useState({
    branchId: user?.branchId ?? '',
    customerId: '' as string | null,
    deviceBrand: '',
    deviceModel: '',
    deviceImei: '' as string | null,
    problemDescription: '',
    laborCost: 0,
    paid: 0,
    warrantyDays: 30,
  });

  const update = <K extends keyof typeof values>(key: K, val: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!values.branchId) throw new Error('لا يوجد فرع مرتبط بحسابك');
      if (!values.customerId) throw new Error('اختر العميل');
      if (!values.deviceBrand || !values.deviceModel) throw new Error('أدخل نوع وموديل الجهاز');
      if (!values.problemDescription) throw new Error('أدخل وصف المشكلة');

      return repairsApi.create({
        branchId: values.branchId,
        customerId: values.customerId,
        technicianId: null,
        deviceBrand: values.deviceBrand,
        deviceModel: values.deviceModel,
        deviceImei: values.deviceImei || null,
        devicePassword: null,
        problemDescription: values.problemDescription,
        customerNotes: null,
        accessories: [],
        inspectionPhotos: [],
        estimatedDeliveryAt: null,
        laborCost: values.laborCost,
        partsCost: 0,
        discount: 0,
        paid: values.paid,
        warrantyDays: values.warrantyDays,
        notes: null,
      });
    },
    onSuccess: (repair) => {
      toast.success(`تم استلام الجهاز — تذكرة ${repair.ticket_no}`);
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      if (values.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customer', values.customerId] });
      }
      navigate(`/repairs/${repair.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="استلام جهاز للصيانة"
        description="أنشئ تذكرة صيانة جديدة"
        actions={
          <Button asChild variant="outline">
            <Link to="/repairs">
              <ArrowRight className="size-4" />
              <span>العودة للقائمة</span>
            </Link>
          </Button>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-6"
      >
        {/* Customer + branch */}
        <Card>
          <CardHeader>
            <CardTitle>1. العميل والفرع</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>العميل *</Label>
              <CustomerSelect
                value={values.customerId}
                onChange={(id) => update('customerId', id)}
                placeholder="ابحث عن عميل…"
              />
            </div>
            <div className="space-y-2">
              <Label>الفرع</Label>
              <BranchSelect
                value={values.branchId}
                onChange={(v) => update('branchId', v ?? '')}
                disabled
              />
            </div>
          </CardContent>
        </Card>

        {/* Device info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="size-5" />
              2. بيانات الجهاز
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="deviceBrand">العلامة التجارية *</Label>
              <Input
                id="deviceBrand"
                required
                value={values.deviceBrand}
                onChange={(e) => update('deviceBrand', e.target.value)}
                placeholder="مثال: Samsung"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceModel">الموديل *</Label>
              <Input
                id="deviceModel"
                required
                value={values.deviceModel}
                onChange={(e) => update('deviceModel', e.target.value)}
                placeholder="مثال: Galaxy A52"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceImei">IMEI</Label>
              <Input
                id="deviceImei"
                value={values.deviceImei ?? ''}
                onChange={(e) => update('deviceImei', e.target.value || null)}
                placeholder="15 رقم"
                dir="ltr"
                maxLength={15}
                className="font-mono"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="problemDescription">وصف المشكلة *</Label>
              <Textarea
                id="problemDescription"
                required
                value={values.problemDescription}
                onChange={(e) => update('problemDescription', e.target.value)}
                rows={3}
                placeholder="اشرح المشكلة بالتفصيل"
              />
            </div>
          </CardContent>
        </Card>

        {/* Costs + warranty */}
        <Card>
          <CardHeader>
            <CardTitle>3. التكاليف والضمان</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="laborCost">أجرة العمل</Label>
              <Input
                id="laborCost"
                type="number"
                step="0.01"
                min="0"
                value={values.laborCost}
                onChange={(e) => update('laborCost', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid">مدفوع مقدماً</Label>
              <Input
                id="paid"
                type="number"
                step="0.01"
                min="0"
                value={values.paid}
                onChange={(e) => update('paid', Number(e.target.value))}
              />
            </div>
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
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/repairs">إلغاء</Link>
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            <Save className="size-4" />
            <span>استلام الجهاز</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
