/**
 * Shared report components: DateRangePicker, StatCard, ChartCard, ExportButton.
 */
import { useState, type ReactNode } from 'react';
import { Calendar, Download, Printer } from 'lucide-react';
import { Button, Input } from '@components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui';
import { formatCurrency } from '@core/utils/format';
import { cn } from '@core/utils/cn';

// ─── DateRangePicker ──────────────────────────────────────────────

export function DateRangePicker({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onPreset,
}: {
  fromDate?: string;
  toDate?: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onPreset?: (days: number) => void;
}) {
  const presets = [
    { label: 'اليوم', days: 0 },
    { label: '7 أيام', days: 7 },
    { label: '30 يوم', days: 30 },
    { label: '90 يوم', days: 90 },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="size-4 text-muted-foreground" />
      <Input type="date" value={fromDate ?? ''} onChange={(e) => onFromChange(e.target.value)} className="h-9 w-auto" />
      <span className="text-muted-foreground text-xs">→</span>
      <Input type="date" value={toDate ?? ''} onChange={(e) => onToChange(e.target.value)} className="h-9 w-auto" />
      {onPreset ? (
        <div className="flex gap-1">
          {presets.map((p) => (
            <Button key={p.days} variant="outline" size="sm" onClick={() => onPreset(p.days)}>{p.label}</Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'destructive' | 'warning' | 'primary';
}

export function StatCard({ label, value, subtitle, icon, variant = 'default' }: StatCardProps) {
  const colorClass = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/10 text-warning',
    primary: 'bg-primary/10 text-primary',
  }[variant];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {icon ? <div className={cn('flex size-9 items-center justify-center rounded-md', colorClass)}>{icon}</div> : null}
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

// ─── ChartCard ────────────────────────────────────────────────────

export function ChartCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── ExportButton ─────────────────────────────────────────────────

export function ExportButton({ onPrint }: { onPrint: () => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onPrint}>
        <Printer className="size-4" />
        <span>طباعة</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Download className="size-4" />
        <span>تصدير PDF</span>
      </Button>
    </div>
  );
}

// ─── Helper: format report dates ──────────────────────────────────

export function formatReportDate(date: string): string {
  return new Date(date).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' });
}

export function formatReportCurrency(amount: number): string {
  return formatCurrency(amount);
}
