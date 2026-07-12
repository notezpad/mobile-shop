/**
 * Repair create form — receive a device for repair.
 * Detailed form: customer, device info, problem, accessories, photos, costs.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Smartphone, Camera, X, Plus } from 'lucide-react';
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
  Badge,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { CustomerSelect } from '@components/data/CustomerSelect';
import { BranchSelect } from '@components/data/BranchSelect';
import { useAuthStore } from '@stores/auth.store';
import { repairsApi } from '../api/repairs.api';

const COMMON_ACCESSORIES = ['شاحن', 'كابل', 'جراب', 'سماعة', 'علبة', 'بطارية'];

export default function RepairFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [values, setValues] = useState({
    branchId: user?.branchId ?? '',
    customerId: '' as string | null,
    technicianId: '' as string | null,
    deviceBrand: '',
    deviceModel: '',
    deviceImei: '' as string | null,
    devicePassword: '' as string | null,
    problemDescription: '',
    customerNotes: '' as string | null,
    accessories: [] as string[],
    estimatedDeliveryAt: '' as string | null,
    laborCost: 0,
    discount: 0,
    paid: 0,
    warrantyDays: 30,
    notes: '' as string | null,
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [customAccessory, setCustomAccessory] = useState('');

  const update = <K extends keyof typeof values>(key: K, val: (typeof values)[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const toggleAccessory = (acc: string) => {
    setValues((prev) => ({
      ...prev,
      accessories: prev.accessories.includes(acc)
        ? prev.accessories.filter((a) => a !== acc)
        : [...prev.accessories, acc],
    }));
  };

  const addCustomAccessory = () => {
    if (customAccessory.trim() && !values.accessories.includes(customAccessory.trim())) {
      setValues((prev) => ({ ...prev, accessories: [...prev.accessories, customAccessory.trim()] }));
      setCustomAccessory('');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (photos.length + files.length > 4) {
      toast.warning('حد أقصى 4 صور');
      return;
    }
    files.forEach((file) => {
      if (file.size > 2 * 1024 * 1024) {
        toast.error(`الصورة ${file.name} كبيرة الحد (أقصى 2MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPhotos((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
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
        technicianId: values.technicianId || null,
        deviceBrand: values.deviceBrand,
        deviceModel: values.deviceModel,
        deviceImei: values.deviceImei || null,
        devicePassword: values.devicePassword || null,
        problemDescription: values.problemDescription,
        customerNotes: values.customerNotes || null,
        accessories: values.accessories,
        inspectionPhotos: photos,
        estimatedDeliveryAt: values.estimatedDeliveryAt ? new Date(values.estimatedDeliveryAt).toISOString() : null,
        laborCost: values.laborCost,
        partsCost: 0, // parts added later
        discount: values.discount,
        paid: values.paid,
        warrantyDays: values.warrantyDays,
        notes: values.notes || null,
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
            <div className="space-y-2">
              <Label htmlFor="devicePassword">كلمة مرور الجهاز</Label>
              <Input
                id="devicePassword"
                value={values.devicePassword ?? ''}
                onChange={(e) => update('devicePassword', e.target.value || null)}
                placeholder="إن وجدت"
                dir="ltr"
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
                placeholder="اشرح المشكلة بالتفصيل: ما الذي لا يعمل؟ متى بدأت؟ هل توجد أعراض أخرى؟"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customerNotes">ملاحظات العميل</Label>
              <Textarea
                id="customerNotes"
                value={values.customerNotes ?? ''}
                onChange={(e) => update('customerNotes', e.target.value || null)}
                rows={2}
                placeholder="ملاحظات إضافية من العميل"
              />
            </div>
          </CardContent>
        </Card>

        {/* Accessories */}
        <Card>
          <CardHeader>
            <CardTitle>3. الملحقات المستلمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {COMMON_ACCESSORIES.map((acc) => (
                <label
                  key={acc}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    values.accessories.includes(acc)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={values.accessories.includes(acc)}
                    onChange={() => toggleAccessory(acc)}
                    className="size-3 accent-primary"
                  />
                  <span>{acc}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customAccessory}
                onChange={(e) => setCustomAccessory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomAccessory();
                  }
                }}
                placeholder="إضافة ملحق آخر…"
                className="h-9"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomAccessory}>
                <Plus className="size-4" />
              </Button>
            </div>
            {values.accessories.filter((a) => !COMMON_ACCESSORIES.includes(a)).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {values.accessories
                  .filter((a) => !COMMON_ACCESSORIES.includes(a))
                  .map((acc) => (
                    <Badge key={acc} variant="secondary" className="text-[10px]">
                      {acc}
                      <button type="button" onClick={() => toggleAccessory(acc)} className="mr-1">
                        <X className="size-2.5" />
                      </button>
                    </Badge>
                  ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="size-5" />
              4. صور الفحص (حد أقصى 4)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square overflow-hidden rounded-md border">
                  <img src={photo} alt={`صورة ${idx + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow hover:bg-background"
                  >
                    <X className="size-3 text-destructive" />
                  </button>
                </div>
              ))}
              {photos.length < 4 ? (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-input bg-muted/30 hover:bg-muted/50">
                  <Camera className="size-6 text-muted-foreground" />
                  <span className="mt-1 text-xs text-muted-foreground">رفع صورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Costs + warranty */}
        <Card>
          <CardHeader>
            <CardTitle>5. التكاليف والضمان</CardTitle>
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
              <Label htmlFor="discount">الخصم</Label>
              <Input
                id="discount"
                type="number"
                step="0.01"
                min="0"
                value={values.discount}
                onChange={(e) => update('discount', Number(e.target.value))}
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
            <div className="space-y-2">
              <Label htmlFor="estimatedDeliveryAt">التسليم المتوقع</Label>
              <Input
                id="estimatedDeliveryAt"
                type="datetime-local"
                value={values.estimatedDeliveryAt ?? ''}
                onChange={(e) => update('estimatedDeliveryAt', e.target.value || null)}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="notes">ملاحظات داخلية</Label>
              <Textarea
                id="notes"
                value={values.notes ?? ''}
                onChange={(e) => update('notes', e.target.value || null)}
                rows={2}
                placeholder="ملاحظات للفني / الإدارة"
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

      {void LoadingState}
    </div>
  );
}
