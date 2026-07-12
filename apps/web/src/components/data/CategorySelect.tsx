/**
 * CategorySelect — dropdown that supports flat or tree display of categories.
 *
 * Usage:
 *   <CategorySelect value={categoryId} onChange={setCategoryId} />
 */
import { useCategoryTree } from '@modules/catalog/hooks/useCatalog';
import { cn } from '@core/utils/cn';
import type { Category } from '@mobile-shop/shared';

interface CategorySelectProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

interface FlatNode {
  id: string;
  name: string;
  depth: number;
}

function flattenTree(nodes: Array<Category & { children?: Category[] }>, depth = 0): FlatNode[] {
  const out: FlatNode[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    if (n.children && n.children.length > 0) {
      out.push(...flattenTree(n.children as Array<Category & { children?: Category[] }>, depth + 1));
    }
  }
  return out;
}

export function CategorySelect({
  value,
  onChange,
  allowClear = true,
  placeholder = '— بدون فئة —',
  className,
  disabled,
  required,
}: CategorySelectProps) {
  const { tree = [], isLoading } = useCategoryTree();
  const flat = flattenTree(tree);

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
      <option value="">{isLoading ? 'جارٍ تحميل الفئات…' : placeholder}</option>
      {flat.map((node) => (
        <option key={node.id} value={node.id}>
          {'— '.repeat(node.depth)}
          {node.name}
        </option>
      ))}
      {allowClear && value ? <option value="">— مسح التحديد —</option> : null}
    </select>
  );
}
