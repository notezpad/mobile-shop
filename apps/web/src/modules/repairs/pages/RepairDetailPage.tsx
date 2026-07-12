/**
 * Repair detail page — status timeline + parts + costs + deliver action.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Wrench,
  Smartphone,
  User,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  Package,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@components/layout/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Label,
  Textarea,
} from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { useRepair, repairsApi } from '../api/repairs.api';
import { useProducts } from '@modules/catalog/hooks/useCatalog';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';
import type { RepairStatus } from '@mobile-shop/shared';

type StatusMeta = {
  label: string;
  variant: 'secondary' | 'info' | 'warning' | 'success' | 'destructive';
};

const STATUS_META: Record<string, StatusMeta> = {
  received: { label: 'مستلم', variant: 'secondary' },
  diagnosing: { label: 'تحت الفحص', variant: 'info' },
  waiting_parts: { label: 'بانتظار قطع', variant: 'warning' },
  repairing: { label: 'قيد الإصلاح', variant: 'info' },
  ready: { label: 'جاهز', variant: 'success' },
  delivered: { label: 'تم التسليم', variant: 'success' },
  canceled: { label: 'ملغي', variant: 'destructive' },
  warranty_return: { label: 'ضمان', variant: 'warning' },
};

const DEFAULT_STATUS_META: StatusMeta = { label: '—', variant: 'secondary' };

const NEXT_STATUSES: Record<string, string[]> = {
  received: ['diagnosing', 'waiting_parts', 'repairing', 'ready', 'canceled'],
  diagnosing: ['waiting_parts', 'repairing', 'ready', 'canceled'],
  waiting_parts: ['repairing', 'ready', 'canceled'],
  repairing: ['ready', 'canceled'],
  ready: ['delivered', 'warranty_return', 'canceled'],
  warranty_return: ['diagnosing', 'repairing', 'ready', 'canceled'],
  delivered: ['warranty_return'],
  canceled: [],
};

export default function RepairDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: repair, isLoading } = useRepair(id);
  const queryClient = useQueryClient();
  const [showAddPart, setShowAddPart] = useState(false);
  const [showDeliver, setShowDeliver] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Add part state.
  const [partProductId, setPartProductId] = useState('');
  const [partQty, setPartQty] = useState(1);
  const [partPrice, setPartPrice] = useState(0);

  // Deliver state.
  const [deliverPaid, setDeliverPaid] = useState(0);
  const [deliverNotes, setDeliverNotes] = useState('');

  const { data: productsResult } = useProducts({ page: 1, pageSize: 200, sortBy: 'name', sortDir: 'asc' });
  const products = productsResult?.items ?? [];

  const statusMutation = useMutation({
    mutationFn: () =>
      repairsApi.changeStatus(id!, {
        status: newStatus as RepairStatus,
        note: statusNote || null,
      }),
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      queryClient.invalidateQueries({ queryKey: ['repair', id] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      setShowStatusChange(false);
      setNewStatus('');
      setStatusNote('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addPartMutation = useMutation({
    mutationFn: () =>
      repairsApi.addPart(id!, {
        productId: partProductId,
        quantity: partQty,
        unitPrice: partPrice,
      }),
    onSuccess: () => {
      toast.success('تمت إضافة قطعة الغيار');
      queryClient.invalidateQueries({ queryKey: ['repair', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setShowAddPart(false);
      setPartProductId('');
      setPartQty(1);
      setPartPrice(0);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removePartMutation = useMutation({
    mutationFn: (partId: string) => repairsApi.removePart(id!, partId),
    onSuccess: () => {
      toast.success('تم حذف قطعة الغيار');
      queryClient.invalidateQueries({ queryKey: ['repair', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deliverMutation = useMutation({
    mutationFn: () =>
      repairsApi.deliver(id!, { paid: deliverPaid, notes: deliverNotes || null }),
    onSuccess: () => {
      toast.success('تم تسليم الجهاز');
      queryClient.invalidateQueries({ queryKey: ['repair', id] });
      queryClient.invalidateQueries({ queryKey: ['repairs'] });
      setShowDeliver(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !repair) return <LoadingState message="جارٍ تحميل التذكرة…" />;

  const statusMeta = STATUS_META[repair.status] ?? DEFAULT_STATUS_META;
  const nextStatuses = NEXT_STATUSES[repair.status] ?? [];
  const canChangeStatus = nextStatuses.length > 0 && repair.status !== 'delivered' && repair.status !== 'canceled';
  const canDeliver = repair.status === 'ready';

  return (
    <div className="page-container">
      <PageHeader
        title={`تذكرة ${repair.ticket_no}`}
        description={`${repair.device_brand} ${repair.device_model}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/repairs">
                <ArrowRight className="size-4" />
                <span>العودة</span>
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/repairs/track/${repair.ticket_no}`}>
                <QrCode className="size-4" />
                <span>تتبع</span>
              </Link>
            </Button>
            {canChangeStatus ? (
              <RequirePermission permission="repairs.edit">
                <Button onClick={() => setShowStatusChange(true)}>
                  <Wrench className="size-4" />
                  <span>تغيير الحالة</span>
                </Button>
              </RequirePermission>
            ) : null}
            {canDeliver ? (
              <RequirePermission permission="repairs.deliver">
                <Button variant="success" onClick={() => setShowDeliver(true)}>
                  <CheckCircle2 className="size-4" />
                  <span>تسليم الجهاز</span>
                </Button>
              </RequirePermission>
            ) : null}
          </>
        }
      />

      {/* Status banner */}
      <div className="flex items-center gap-2">
        <Badge variant={statusMeta.variant} className="text-sm">{statusMeta.label}</Badge>
        {repair.due_amount > 0 ? (
          <Badge variant="warning">متبقي: {formatCurrency(repair.due_amount)}</Badge>
        ) : null}
        {repair.warranty_days > 0 ? (
          <Badge variant="info">ضمان: {repair.warranty_days} يوم</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Device info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Smartphone className="size-4" />
              بيانات الجهاز
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">العلامة / الموديل</p>
              <p className="font-medium">{repair.device_brand} {repair.device_model}</p>
            </div>
            {repair.device_imei ? (
              <div>
                <p className="text-xs text-muted-foreground">IMEI</p>
                <p className="font-mono" dir="ltr">{repair.device_imei}</p>
              </div>
            ) : null}
            {repair.device_password ? (
              <div>
                <p className="text-xs text-muted-foreground">كلمة المرور</p>
                <p className="font-mono" dir="ltr">{repair.device_password}</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs text-muted-foreground">المشكلة</p>
              <p className="whitespace-pre-wrap">{repair.problem_description}</p>
            </div>
            {repair.customer_notes ? (
              <div>
                <p className="text-xs text-muted-foreground">ملاحظات العميل</p>
                <p className="whitespace-pre-wrap">{repair.customer_notes}</p>
              </div>
            ) : null}
            {repair.accessories?.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">الملحقات</p>
                <div className="flex flex-wrap gap-1">
                  {repair.accessories.map((a, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{a}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {repair.inspection_photos?.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">صور الفحص</p>
                <div className="grid grid-cols-4 gap-1">
                  {repair.inspection_photos.map((photo, i) => (
                    <img key={i} src={photo} alt={`صورة ${i + 1}`} className="aspect-square rounded border object-cover" />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Parties */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="size-4" />
              الأطراف
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">العميل</p>
              <Link to={`/customers/${repair.customer_id}`} className="font-medium hover:underline">
                {repair.customer_name ?? '—'}
              </Link>
              {repair.customer_phone ? (
                <p className="text-xs text-muted-foreground" dir="ltr">{repair.customer_phone}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الفني</p>
              <p className="font-medium">{repair.technician_name ?? 'غير مُسند'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مستلم الجهاز</p>
              <p className="font-medium">{repair.received_by_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الفرع</p>
              <p className="font-medium">{repair.branch_name ?? '—'}</p>
            </div>
          </CardContent>
        </Card>

        {/* Costs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4" />
              التكاليف
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">أجرة العمل</span>
              <span className="tabular-nums">{formatCurrency(repair.labor_cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">قطع الغيار</span>
              <span className="tabular-nums">{formatCurrency(repair.parts_cost)}</span>
            </div>
            {repair.discount > 0 ? (
              <div className="flex justify-between text-success">
                <span>الخصم</span>
                <span className="tabular-nums">-{formatCurrency(repair.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-bold">
              <span>الإجمالي</span>
              <span className="tabular-nums text-primary">{formatCurrency(repair.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">مدفوع</span>
              <span className="tabular-nums">{formatCurrency(repair.paid)}</span>
            </div>
            {repair.due_amount > 0 ? (
              <div className="flex justify-between font-bold text-destructive">
                <span>متبقي</span>
                <span className="tabular-nums">{formatCurrency(repair.due_amount)}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Parts */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="size-4" />
              قطع الغيار ({repair.parts?.length ?? 0})
            </CardTitle>
            {repair.status !== 'delivered' && repair.status !== 'canceled' ? (
              <RequirePermission permission="repairs.edit">
                <Button variant="outline" size="sm" onClick={() => setShowAddPart(true)}>
                  <Plus className="size-4" />
                  <span>إضافة</span>
                </Button>
              </RequirePermission>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {repair.parts && repair.parts.length > 0 ? (
              <div className="divide-y">
                {repair.parts.map((part) => (
                  <div key={part.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <div>
                      <p className="font-medium">{part.product_name ?? 'منتج'}</p>
                      <p className="text-xs text-muted-foreground">
                        {part.quantity} × {formatCurrency(part.unit_price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold tabular-nums">{formatCurrency(part.total)}</span>
                      {repair.status !== 'delivered' && repair.status !== 'canceled' ? (
                        <RequirePermission permission="repairs.edit">
                          <ConfirmDialog
                            trigger={
                              <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label="حذف">
                                <Trash2 className="size-3.5" />
                              </Button>
                            }
                            title="حذف قطعة الغيار"
                            description="سيتم إرجاع القطعة للمخزون. هل أنت متأكد؟"
                            confirmLabel="حذف"
                            destructive
                            onConfirm={async () => {
                              await removePartMutation.mutateAsync(part.id);
                            }}
                          />
                        </RequirePermission>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-4 text-center text-sm text-muted-foreground">لا قطع غيار مضافة</p>
            )}
          </CardContent>
        </Card>

        {/* Status history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4" />
              سجل الحالات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {repair.history && repair.history.length > 0 ? (
              <div className="divide-y">
                {repair.history.map((h, idx) => {
                  const hMeta = STATUS_META[h.to_status] ?? DEFAULT_STATUS_META;
                  return (
                    <div key={h.id ?? idx} className="flex items-start gap-3 px-4 py-2 text-sm">
                      <div className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-${hMeta.variant}/10 text-${hMeta.variant}`}>
                        <CheckCircle2 className="size-3" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={hMeta.variant} className="text-[10px]">{hMeta.label}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span>
                        </div>
                        {h.note ? <p className="mt-0.5 text-xs text-muted-foreground">{h.note}</p> : null}
                        {h.user_name ? <p className="text-[10px] text-muted-foreground">بواسطة: {h.user_name}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="p-4 text-center text-sm text-muted-foreground">لا سجل</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add part dialog */}
      {showAddPart ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">إضافة قطعة غيار</h2>
              <div className="space-y-2">
                <Label>المنتج</Label>
                <select
                  value={partProductId}
                  onChange={(e) => setPartProductId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
                >
                  <option value="">اختر المنتج…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>الكمية</Label>
                  <Input
                    type="number"
                    min="1"
                    value={partQty}
                    onChange={(e) => setPartQty(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>السعر</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={partPrice}
                    onChange={(e) => setPartPrice(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddPart(false)}>إلغاء</Button>
                <Button
                  onClick={() => addPartMutation.mutate()}
                  loading={addPartMutation.isPending}
                  disabled={!partProductId}
                >
                  إضافة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Status change dialog */}
      {showStatusChange ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">تغيير الحالة</h2>
              <div className="space-y-2">
                <Label>الحالة الجديدة</Label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
                >
                  <option value="">اختر الحالة…</option>
                  {nextStatuses.map((s) => (
                    <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>ملاحظة (اختياري)</Label>
                <Textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={2}
                  placeholder="ملاحظة على تغيير الحالة"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowStatusChange(false)}>إلغاء</Button>
                <Button
                  onClick={() => statusMutation.mutate()}
                  loading={statusMutation.isPending}
                  disabled={!newStatus}
                >
                  تأكيد
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Deliver dialog */}
      {showDeliver ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">تسليم الجهاز</h2>
              <div className="rounded-md bg-muted/30 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الإجمالي</span>
                  <span className="font-bold">{formatCurrency(repair.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">مدفوع سابقاً</span>
                  <span>{formatCurrency(repair.paid)}</span>
                </div>
                <div className="flex justify-between font-bold text-destructive">
                  <span>المتبقي</span>
                  <span>{formatCurrency(repair.due_amount)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>المبلغ المدفوع الآن</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={deliverPaid}
                  onChange={(e) => setDeliverPaid(Number(e.target.value))}
                  placeholder={String(repair.due_amount)}
                />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات التسليم"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDeliver(false)}>إلغاء</Button>
                <Button
                  variant="success"
                  onClick={() => deliverMutation.mutate()}
                  loading={deliverMutation.isPending}
                >
                  <CheckCircle2 className="size-4" />
                  تأكيد التسليم
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
