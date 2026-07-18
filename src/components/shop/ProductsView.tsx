'use client'

import * as React from 'react'
import {
  FolderOpen,
  ImageOff,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProductDialog, type ProductFormValues } from './ProductDialog'
import { CategoryManagerDialog } from './CategoryManagerDialog'
import { PrintLabelsDialog } from './PrintLabelsDialog'
import { Barcode } from './Barcode'
import { useShopStore } from '@/lib/store'

interface Product {
  id: number
  name: string
  category: string | null
  barcode: string | null
  price: number
  cost: number
  quantity: number
  minQuantity: number
  imagePath: string | null
  soldQuantity?: number
}

export function ProductsView() {
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [initial, setInitial] = React.useState<Partial<ProductFormValues> | null>(null)
  const [catDialogOpen, setCatDialogOpen] = React.useState(false)
  const [confirmId, setConfirmId] = React.useState<number | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const [labelsDialogOpen, setLabelsDialogOpen] = React.useState(false)
  const [singlePrintProduct, setSinglePrintProduct] = React.useState<Product | null>(null)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)

  const loadCats = React.useCallback(async () => {
    try {
      const data = await api<{ id: number; name: string }[]>('/api/categories')
      setCategories(data)
    } catch {
      /* ignore */
    }
  }, [])

  const loadProducts = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category && category !== 'all') params.set('category', category)
      const data = await api<Product[]>(`/api/products?${params.toString()}`)
      setProducts(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المنتجات')
    } finally {
      setLoading(false)
    }
  }, [search, category])

  React.useEffect(() => {
    loadCats()
  }, [loadCats])

  React.useEffect(() => {
    const t = setTimeout(loadProducts, 250)
    return () => clearTimeout(t)
  }, [loadProducts])

  // Quick-add product requested from POS
  React.useEffect(() => {
    if (quickAdd.open) {
      setInitial(quickAdd.seed ? { name: quickAdd.seed, barcode: quickAdd.seed } : {})
      setDialogOpen(true)
      closeQuickAdd()
    }
  }, [quickAdd, closeQuickAdd])

  const openAdd = () => {
    setInitial(null)
    setDialogOpen(true)
  }
  const openEdit = (p: Product) => {
    setInitial({
      id: p.id,
      name: p.name,
      category: p.category,
      barcode: p.barcode,
      price: p.price,
      cost: p.cost,
      quantity: p.quantity,
      minQuantity: p.minQuantity,
      imagePath: p.imagePath,
    })
    setDialogOpen(true)
  }

  const removeProduct = async (id: number) => {
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' })
      toast.success('تم حذف المنتج')
      loadProducts()
      loadCats()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الحذف')
    } finally {
      setConfirmId(null)
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))
    )
  }
  const printOneLabel = (p: Product) => {
    setSinglePrintProduct(p)
    setLabelsDialogOpen(true)
  }
  const openBulkLabels = () => {
    setSinglePrintProduct(null)
    setLabelsDialogOpen(true)
  }
  const labelProducts = singlePrintProduct
    ? [singlePrintProduct]
    : products.filter((p) => selectedIds.has(p.id))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">المنتجات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة الأصناف والمخزون
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الباركود..."
              className="pr-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="كل التصنيفات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التصنيفات</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setCatDialogOpen(true)}>
            <FolderOpen className="size-4" />
            التصنيفات
          </Button>
          <Button
            variant="outline"
            onClick={openBulkLabels}
            disabled={selectedIds.size === 0}
          >
            <Printer className="size-4" />
            طباعة ملصقات {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="size-4" />
            منتج جديد
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={products.length > 0 && selectedIds.size === products.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-14 text-center">الصورة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead className="w-28">التصنيف</TableHead>
                    <TableHead className="w-44">الباركود</TableHead>
                    <TableHead className="w-28 text-center">التكلفة</TableHead>
                    <TableHead className="w-28 text-center">السعر</TableHead>
                    <TableHead className="w-16 text-center">الكمية</TableHead>
                    <TableHead className="w-20 text-center">الحد الأدنى</TableHead>
                    <TableHead className="w-24 text-center">عدد المبيعات</TableHead>
                    <TableHead className="w-20 text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        className="py-8 text-center text-muted-foreground"
                      >
                        لا توجد منتجات
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((p, index) => {
                      const low = p.quantity <= p.minQuantity
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={selectedIds.has(p.id)}
                              onCheckedChange={() => toggleSelect(p.id)}
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">
                            {index + 1}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted mx-auto">
                              {p.imagePath ? (
                                <img
                                  src={p.imagePath}
                                  alt={p.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageOff className="size-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            {p.category ? (
                              <Badge variant="secondary">{p.category}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Barcode value={p.barcode} height={26} fontSize={10} />
                          </TableCell>
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {formatCurrency(p.cost)}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums">
                            {formatCurrency(p.price)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                'font-semibold tabular-nums',
                                low && 'text-destructive'
                              )}
                            >
                              {p.quantity}
                            </span>
                            {low && (
                              <span className="mr-1 text-xs text-destructive">
                                (تنبيه)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums text-muted-foreground">
                            {p.minQuantity}
                          </TableCell>
                          <TableCell className="text-center font-semibold tabular-nums text-blue-600">
                            {p.soldQuantity ?? 0}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="طباعة ملصق باركود"
                                onClick={() => printOneLabel(p)}
                              >
                                <Printer className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive hover:text-destructive"
                                onClick={() => setConfirmId(p.id)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={initial}
        categories={categories}
        onSaved={() => {
          loadProducts()
          loadCats()
        }}
      />
      <CategoryManagerDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        onChanged={() => {
          loadCats()
          loadProducts()
        }}
      />
      <PrintLabelsDialog
        open={labelsDialogOpen}
        onOpenChange={(v) => {
          setLabelsDialogOpen(v)
          if (!v) setSinglePrintProduct(null)
        }}
        products={labelProducts}
      />

      {/* simple inline confirm */}
      {confirmId !== null && (
        <ConfirmDialog
          title="حذف المنتج"
          message="هل أنت متأكد من حذف هذا المنتج؟"
          onConfirm={() => removeProduct(confirmId)}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-center">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onCancel}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              حذف
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
