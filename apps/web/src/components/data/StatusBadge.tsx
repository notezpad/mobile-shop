/**
 * StatusBadge — colored pill for user/role status.
 */
import { Badge, type BadgeProps } from '@components/ui';
import { cn } from '@core/utils/cn';

type Variant = NonNullable<BadgeProps['variant']>;

const statusMap: Record<string, { variant: Variant; label: string }> = {
  active: { variant: 'success', label: 'نشط' },
  suspended: { variant: 'destructive', label: 'موقوف' },
  invited: { variant: 'info', label: 'مدعو' },
  on_leave: { variant: 'warning', label: 'في إجازة' },
  terminated: { variant: 'destructive', label: 'منتهي' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusMap[status] ?? { variant: 'secondary' as Variant, label: status };
  return (
    <Badge variant={config.variant} className={cn('font-medium', className)}>
      {config.label}
    </Badge>
  );
}
