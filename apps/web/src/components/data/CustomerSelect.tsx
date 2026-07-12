/**
 * CustomerSelect — searchable dropdown for selecting a customer.
 * Used in POS, repairs, and return forms.
 */
import { useState, useRef, useEffect } from 'react';
import { useCustomers } from '@modules/customers/hooks/useCustomers';
import { cn } from '@core/utils/cn';
import { Search, User, X } from 'lucide-react';
import { formatCurrency } from '@core/utils/format';

interface CustomerSelectProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export function CustomerSelect({
  value,
  onChange,
  allowClear = true,
  placeholder = 'بحث بالاسم أو الهاتف…',
  className,
  disabled,
  required,
}: CustomerSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useCustomers({
    page: 1,
    pageSize: 20,
    search: search || undefined,
    sortBy: 'name',
    sortDir: 'asc',
  });

  const customers = data?.items ?? [];
  const selected = customers.find((c) => c.id === value);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={open ? search : selected?.name ?? ''}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          required={required}
          placeholder={selected ? selected.name : placeholder}
          className="h-10 w-full rounded-md border border-input bg-background pr-9 pl-9 text-sm focus-ring disabled:opacity-50"
        />
        {allowClear && value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setSearch('');
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-elevated">
          {isLoading ? (
            <div className="p-3 text-center text-sm text-muted-foreground">جارٍ البحث…</div>
          ) : customers.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              {search ? 'لا نتائج. اضغط Enter لإضافة عميل جديد.' : 'ابدأ الكتابة للبحث…'}
            </div>
          ) : (
            <ul className="divide-y">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-right hover:bg-muted/50"
                  >
                    <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.phone ?? '—'}
                        {c.balance !== 0 ? ` • رصيد: ${formatCurrency(c.balance)}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {void User}
    </div>
  );
}
