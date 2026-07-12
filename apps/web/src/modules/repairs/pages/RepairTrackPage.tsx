/**
 * Public repair tracking page — accessible via QR code scan.
 * No login required. Shows only public info (no customer phone, no internal notes).
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Search,
  Smartphone,
  CheckCircle2,
  Clock,
  Wrench,
  Package,
  AlertCircle,
} from 'lucide-react';
import { Button, Input, Badge, Card, CardContent } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { useRepairTracking } from '../api/repairs.api';
import { formatCurrency } from '@core/utils/format';
import { formatDateTime } from '@core/utils/date';

type StatusMeta = {
  label: string;
  variant: 'secondary' | 'info' | 'warning' | 'success' | 'destructive';
  icon: typeof Wrench;
  description: string;
};

const STATUS_META: Record<string, StatusMeta> = {
  received: { label: 'تم الاستلام', variant: 'secondary', icon: Package, description: 'تم استلام جهازك بنجاح' },
  diagnosing: { label: 'تحت الفحص', variant: 'info', icon: Search, description: 'الفني يفحص الجهاز لتحديد المشكلة' },
  waiting_parts: { label: 'بانتظار قطع غيار', variant: 'warning', icon: Clock, description: 'في انتظار وصول قطع الغيار' },
  repairing: { label: 'قيد الإصلاح', variant: 'info', icon: Wrench, description: 'الفني يقوم بإصلاح الجهاز' },
  ready: { label: 'جاهز للاستلام', variant: 'success', icon: CheckCircle2, description: 'الجهاز جاهز! يرجى الحضور للاستلام' },
  delivered: { label: 'تم التسليم', variant: 'success', icon: CheckCircle2, description: 'تم تسليم الجهاز للعميل' },
  canceled: { label: 'ملغي', variant: 'destructive', icon: AlertCircle, description: 'تم إلغاء التذكرة' },
  warranty_return: { label: 'عودة الضمان', variant: 'warning', icon: AlertCircle, description: 'الجهاز عاد ضمن الضمان' },
};

const DEFAULT_STATUS_META: StatusMeta = {
  label: '—',
  variant: 'secondary',
  icon: AlertCircle,
  description: '',
};

export default function RepairTrackPage() {
  const { ticketNo } = useParams<{ ticketNo: string }>();
  const [searchInput, setSearchInput] = useState(ticketNo ?? '');

  useEffect(() => {
    if (ticketNo) setSearchInput(ticketNo);
  }, [ticketNo]);

  const { data: tracking, isLoading, error } = useRepairTracking(ticketNo ?? null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center pt-8">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Smartphone className="size-8" />
          </div>
          <h1 className="text-2xl font-bold">تتبع حالة الصيانة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أدخل رقم التذكرة أو امسح QR Code
          </p>
        </div>

        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchInput.trim()) {
              window.location.href = `/repairs/track/${searchInput.trim().toUpperCase()}`;
            }
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="رقم التذكرة (مثال: REP-BR-2026-00001)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              className="h-12 pr-12 text-base font-mono"
              dir="ltr"
            />
          </div>
          <Button type="submit" size="lg" disabled={!searchInput.trim()}>
            تتبع
          </Button>
        </form>

        {/* Result */}
        {ticketNo ? (
          isLoading ? (
            <LoadingState message="جارٍ البحث عن التذكرة…" />
          ) : error ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <AlertCircle className="size-12 text-destructive" />
                <p className="font-medium text-destructive">لم يتم العثور على التذكرة</p>
                <p className="text-sm text-muted-foreground">
                  تأكد من رقم التذكرة وحاول مرة أخرى
                </p>
              </CardContent>
            </Card>
          ) : tracking ? (
            <TrackingResult tracking={tracking} />
          ) : null
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Smartphone className="mx-auto mb-3 size-12 opacity-50" />
              <p>أدخل رقم تذكرة الصيانة لعرض الحالة</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="pb-8 text-center text-xs text-muted-foreground">
          <p>Mobile Shop ERP — نظام تتبع الصيانة</p>
          <Link to="/login" className="mt-1 inline-block hover:underline">
            دخول النظام
          </Link>
        </div>
      </div>
    </div>
  );
}

function TrackingResult({ tracking }: { tracking: NonNullable<ReturnType<typeof useRepairTracking>['data']> }) {
  const statusMeta = STATUS_META[tracking.status] ?? DEFAULT_STATUS_META;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-4">
      {/* Current status */}
      <Card className="overflow-hidden">
        <div className={`bg-${statusMeta.variant}/10 p-6 text-center`}>
          <div className={`mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-${statusMeta.variant}/20 text-${statusMeta.variant}`}>
            <StatusIcon className="size-8" />
          </div>
          <h2 className="text-xl font-bold">{statusMeta.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{statusMeta.description}</p>
        </div>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">رقم التذكرة</p>
              <p className="font-mono font-medium" dir="ltr">{tracking.ticket_no}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الجهاز</p>
              <p className="font-medium">{tracking.device_brand} {tracking.device_model}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تاريخ الاستلام</p>
              <p className="text-sm">{formatDateTime(tracking.received_at)}</p>
            </div>
            {tracking.estimated_delivery_at ? (
              <div>
                <p className="text-xs text-muted-foreground">التسليم المتوقع</p>
                <p className="text-sm">{formatDateTime(tracking.estimated_delivery_at)}</p>
              </div>
            ) : null}
          </div>

          {/* Costs */}
          <div className="rounded-md bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="font-bold">{formatCurrency(tracking.total)}</span>
            </div>
            {tracking.due_amount > 0 ? (
              <div className="flex justify-between text-destructive">
                <span>متبقي</span>
                <span className="font-bold">{formatCurrency(tracking.due_amount)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-success">
                <span>مدفوع بالكامل</span>
                <CheckCircle2 className="size-4" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">سجل الحالات</h3>
          <div className="space-y-3">
            {tracking.history.map((h, idx) => {
              const hMeta = STATUS_META[h.to_status] ?? DEFAULT_STATUS_META;
              const HIcon = hMeta.icon;
              return (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-${hMeta.variant}/10 text-${hMeta.variant}`}>
                    <HIcon className="size-4" />
                  </div>
                  <div className="flex-1 border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <Badge variant={hMeta.variant} className="text-[10px]">{hMeta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span>
                    </div>
                    {h.note ? <p className="mt-1 text-xs text-muted-foreground">{h.note}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
