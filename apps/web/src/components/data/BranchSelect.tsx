/**
 * BranchSelect — shared dropdown for selecting a branch.
 * Uses cached list of active branches.
 *
 * Usage:
 *   <BranchSelect
 *     value={branchId}
 *     onChange={setBranchId}
 *     allowClear
 *     placeholder="اختر الفرع…"
 *   />
 */
import { useBranches } from '@modules/branches/hooks/useBranches';
import { cn } from '@core/utils/cn';

interface BranchSelectProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function BranchSelect({
  value,
  onChange,
  allowClear = true,
  placeholder = 'اختر الفرع…',
  className,
  disabled,
  required,
}: BranchSelectProps) {
  const { data: branches = [], isLoading } = useBranches();

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled || isLoading}
      required={required}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <option value="">{isLoading ? 'جارٍ تحميل الفروع…' : placeholder}</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} {b.is_main ? '(رئيسي)' : ''}
        </option>
      ))}
      {allowClear && value ? (
        <option value="">— مسح التحديد —</option>
      ) : null}
    </select>
  );
}
