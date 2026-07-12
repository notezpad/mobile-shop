import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderTree, Pencil, Trash2, ChevronLeft, Folder } from 'lucide-react';
import { PageHeader } from '@components/layout/PageHeader';
import { EmptyState } from '@components/layout/EmptyState';
import { Card, CardContent, Button, Input, Label, Badge } from '@components/ui';
import { LoadingState } from '@components/feedback/LoadingState';
import { ConfirmDialog } from '@components/feedback/ConfirmDialog';
import { RequirePermission } from '@components/feedback/RequirePermission';
import { categoriesApi } from '../api/catalog.api';
import type { Category } from '@mobile-shop/shared';
import { cn } from '@core/utils/cn';
import { toast } from 'sonner';

interface FlatNode extends Category {
  depth: number;
  childrenCount: number;
}

function flatten(nodes: Category[], depth = 0): FlatNode[] {
  const out: FlatNode[] = [];
  for (const n of nodes) {
    const children = nodes.filter((c) => c.parent_id === n.id);
    out.push({ ...n, depth, childrenCount: children.length });
    if (children.length > 0) {
      out.push(...flatten(children, depth + 1));
    }
  }
  return out.filter((n, i, arr) => i === arr.findIndex((x) => x.id === n.id));
}

export default function CategoriesPage() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', { includeInactive: true }],
    queryFn: () => categoriesApi.list({ includeInactive: true }),
  });

  const flat = useMemo(() => flatten(categories), [categories]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      toast.success('تم حذف الفئة');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="الفئات"
        description={`${categories.length} فئة`}
        actions={
          <RequirePermission permission="catalog.categories.manage">
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="size-4" />
              <span>إضافة فئة</span>
            </Button>
          </RequirePermission>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : flat.length === 0 ? (
        <EmptyState
          icon={<FolderTree />}
          title="لا توجد فئات"
          description="ابدأ بإنشاء أول فئة لتنظيم منتجاتك"
          action={
            <RequirePermission permission="catalog.categories.manage">
              <Button onClick={() => setShowForm(true)}>
                <Plus className="size-4" />
                <span>إضافة فئة</span>
              </Button>
            </RequirePermission>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {flat.map((node) => (
                <div
                  key={node.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 hover:bg-muted/30',
                    !node.is_active && 'opacity-50',
                  )}
                  style={{ paddingRight: `${1 + node.depth * 1.5}rem` }}
                >
                  {node.depth > 0 ? (
                    <ChevronLeft className="size-4 text-muted-foreground" />
                  ) : (
                    <Folder className="size-5 text-primary" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{node.name}</p>
                      {node.childrenCount > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {node.childrenCount} فرعية
                        </Badge>
                      ) : null}
                      {!node.is_active ? (
                        <Badge variant="outline" className="text-[10px]">
                          موقوفة
                        </Badge>
                      ) : null}
                    </div>
                    {node.slug ? (
                      <p className="text-xs text-muted-foreground font-mono">{node.slug}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <RequirePermission
                      permission="catalog.categories.manage"
                      fallback={null}
                    >
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(node);
                          setShowForm(true);
                        }}
                        aria-label="تعديل"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label="حذف">
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        title="حذف الفئة"
                        description={`هل أنت متأكد من حذف "${node.name}"؟`}
                        confirmLabel="حذف"
                        destructive
                        onConfirm={async () => {
                          await deleteMutation.mutateAsync(node.id);
                        }}
                      />
                    </RequirePermission>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showForm ? (
        <CategoryFormDialog
          category={editing}
          categories={categories}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            setShowForm(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Inline form dialog ────────────────────────────────────────────

function CategoryFormDialog({
  category,
  categories,
  onClose,
  onSaved,
}: {
  category: Category | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState<string | null>(category?.parent_id ?? null);
  const [sortOrder, setSortOrder] = useState(category?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(category?.is_active ?? true);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (category) {
        return categoriesApi.update(category.id, { name, parentId, sortOrder, isActive });
      }
      return categoriesApi.create({ name, parentId, sortOrder, isActive });
    },
    onSuccess: () => {
      toast.success(category ? 'تم تحديث الفئة' : 'تم إنشاء الفئة');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Exclude self + descendants from parent options.
  const forbiddenIds = new Set<string>([category?.id ?? '']);
  if (category) {
    let added = true;
    while (added) {
      added = false;
      categories.forEach((c) => {
        if (c.parent_id && forbiddenIds.has(c.parent_id) && !forbiddenIds.has(c.id)) {
          forbiddenIds.add(c.id);
          added = true;
        }
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">
            {category ? 'تعديل فئة' : 'إضافة فئة جديدة'}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="name">اسم الفئة *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: هواتف سامسونج"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent">الفئة الأم</Label>
            <select
              id="parent"
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-ring"
            >
              <option value="">— لا (فئة جذر) —</option>
              {categories
                .filter((c) => !forbiddenIds.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sortOrder">ترتيب الفرز</Label>
              <Input
                id="sortOrder"
                type="number"
                min="0"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 pt-7">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 accent-primary"
                />
                <span>نشطة</span>
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              إلغاء
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!name.trim()}
            >
              {category ? 'حفظ' : 'إنشاء'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
