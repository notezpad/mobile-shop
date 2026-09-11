'use client'

import * as React from 'react'
import {
  FileSpreadsheet,
  FolderOpen,
  ImageOff,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  Power,
  Printer,
  Search,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { ProductUnitsDialog } from './ProductUnitsDialog'
import { ProductVariantsDialog } from './ProductVariantsDialog'
import { CollectionDiscountDialog } from './CollectionDiscountDialog'
import { Package, Percent } from 'lucide-react'
import { Barcode } from './Barcode'
import { useShopStore } from '@/lib/store'
import { exportSimpleExcel, excelFileName } from '@/lib/excel'

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
  active: boolean
  soldQuantity?: number
}

export function ProductsView() {
  const [products, setProducts] = React.useState<Product[]>([])
  const [categories, setCategories] = React.useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [initial, setInitial] = React.useState<Partial<ProductFormValues> | null>(null)
  const [catDialogOpen, setCatDialogOpen] = React.useState(false)
  const [confirmId, setConfirmId] = React.useState<number | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const [labelsDialogOpen, setLabelsDialogOpen] = React.useState(false)
  const [unitsFor, setUnitsFor] = React.useState<{id:number;name:string}|null>(null)
  const [variantsFor, setVariantsFor] = React.useState<{id:number;name:string}|null>(null)
  const [collectionDlg, setCollectionDlg] = React.useState(false)
  const capabilities = useShopStore((st) => st.plan.capabilities)
  const [singlePrintProduct, setSinglePrintProduct] = React.useState<Product | null>(null)
  const quickAdd = useShopStore((s) => s.quickAddProduct)
  const closeQuickAdd = useShopStore((s) => s.closeQuickAddProduct)
  const shopName = useShopStore((s) => s.shopName)
  const shopBranding = useShopStore((s) => s.branding)

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
      params.set('status', status)
      const data = await api<Product[]>(`/api/products?${params.toString()}`)
      setProducts(data)
    } catch (e: any) {
      toast.error(e?.message || 'فشل تحميل المنتجات')
    } finally {
      setLoading(false)
    }
  }, [search, category, status])

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

  const toggleActive = async (p: Product) => {
    try {
      await api(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: { active: !p.active },
      })
      toast.success(p.active ? 'تم تعطيل المنتج' : 'تم تفعيل المنتج')
      loadProducts()
    } catch (e: any) {
      toast.error(e?.message || 'فشل التحديث')
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
  const exportExcel = () => {
    if (products.length === 0) return
    exportSimpleExcel({
      fileName: excelFileName('قائمة-المنتجات'),
      shop: {
        name: shopName,
        phone: shopBranding.phone || undefined,
        address: shopBranding.address || undefined,
      },
      documentTitle: 'قائمة المنتجات',
      periodLabel: category !== 'all' ? `التصنيف: ${category}` : undefined,
      sheetName: 'المنتجات',
      columns: [
        { header: 'المنتج', key: 'name', format: 'text' },
        { header: 'التصنيف', key: 'category', format: 'text' },
        { header: 'الباركود', key: 'barcode', format: 'text' },
        { header: 'سعر البيع', key: 'price', format: 'currency' },
        { header: 'التكلفة', key: 'cost', format: 'currency' },
        { header: 'الكمية المتاحة', key: 'quantity', format: 'int' },
        { header: 'الحد الأدنى', key: 'minQuantity', format: 'int' },
        { header: 'الكمية المباعة', key: 'soldQuantity', format: 'int' },
      ],
      rows: products.map((p) => ({
        name: p.name,
        category: p.category || '-',
        barcode: p.barcode || '-',
        price: p.price,
        cost: p.cost,
        quantity: p.quantity,
        minQuantity: p.minQuantity,
        soldQuantity: p.soldQuantity ?? 0,
      })),
      totals: {
        name: 'الإجمالي',
        quantity: products.reduce((s, p) => s + p.quantity, 0),
        soldQuantity: products.reduce((s, p) => s + (p.soldQuantity ?? 0), 0),
      },
    })
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
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">مفعّل فقط</SelectItem>
              <SelectItem value="inactive">معطّل فقط</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setCatDialogOpen(true)}>
            <FolderOpen className="size-4" />
            التصنيفات
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={products.length === 0}>
            <FileSpreadsheet className="size-4" />
            تصدير Excel
          </Button>
          <Button
            variant="outline"
            onClick={openBulkLabels}
            disabled={selectedIds.size === 0}
          >
            <Printer className="size-4" />
            طباعة ملصقات {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
          {capabilities.includes('collections') && (
            <Button variant="outline" onClick={() => setCollectionDlg(true)}>
              <Percent className="size-4" />
              خصم كوليكشن
            </Button>
          )}
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
            <div className="hidden overflow-x-auto lg:block" dir="ltr">
              {/*
                من lg فما فوق: نعرض الجدول العادي بكل أعمدته. تحته نسخة
                كروت (خارج هذا الشرط) مخصصة للشاشات الأصغر من lg، بدل ما
                نسيب سكرول أفقي على الشاشات الصغيرة/اللابتوبات صغيرة الدقة.
                السبب: جدول بهذا العدد من الأعمدة (12 عمود) لازم مساحة
                عرض كبيرة عشان يتقرأ صح، وعلى الشاشات الضيقة السكرول
                الأفقي بيدي تجربة استخدام مزعجة (المستخدم بيحتاج يسكرول
                يمين وشمال عشان يشوف صف واحد كامل). الكروت بتحل المشكلة
                دي جذريًا بعرض كل بيانات المنتج رأسيًا بدل أفقيًا.
              */}
              <Table className="min-w-[1220px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-center pr-4">
                      <Checkbox
                        checked={products.length > 0 && selectedIds.size === products.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead className="w-14 text-center">الصورة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead className="w-24">التصنيف</TableHead>
                    <TableHead className="w-52">الباركود</TableHead>
                    <TableHead className="w-28 text-center">التكلفة</TableHead>
                    <TableHead className="w-28 text-center">السعر</TableHead>
                    <TableHead className="w-16 text-center">الكمية</TableHead>
                    <TableHead className="w-20 text-center">الحد الأدنى</TableHead>
                    <TableHead className="w-24 text-center">عدد المبيعات</TableHead>
                    <TableHead className="w-24 text-center pl-4">إجراءات</TableHead>
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
                        <TableRow key={p.id} className={!p.active ? 'opacity-50' : ''}>
                          <TableCell className="text-center pr-4">
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
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              {p.name}
                              {!p.active && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                  معطل
                                </span>
                              )}
                            </div>
                          </TableCell>
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
                            <Barcode value={p.barcode} height={20} fontSize={8} fitContainer />
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
                          <TableCell className="text-center font-semibold tabular-nums text-info-subtle-foreground">
                            {p.soldQuantity ?? 0}
                          </TableCell>
                          <TableCell className="text-center pl-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="تعديل المنتج"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    title="المزيد من الإجراءات"
                                  >
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => printOneLabel(p)}>
                                    <Printer className="size-4" />
                                    طباعة ملصق باركود
                                  </DropdownMenuItem>
                                  {capabilities.includes('multi_unit') && (
                                    <DropdownMenuItem
                                      onClick={() => setUnitsFor({ id: p.id, name: p.name })}
                                    >
                                      <Package className="size-4" />
                                      وحدات الجملة
                                    </DropdownMenuItem>
                                  )}
                                  {capabilities.includes('variants') && (
                                    <DropdownMenuItem
                                      onClick={() => setVariantsFor({ id: p.id, name: p.name })}
                                    >
                                      <Palette className="size-4" />
                                      الألوان والمقاسات
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => toggleActive(p)}>
                                    <Power
                                      className={`size-4 ${p.active ? 'text-muted-foreground' : 'text-success-subtle-foreground'}`}
                                    />
                                    {p.active ? 'تعطيل المنتج' : 'تفعيل المنتج'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setConfirmId(p.id)}
                                  >
                                    <Trash2 className="size-4" />
                                    حذف نهائي
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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

          {/*
            نسخة الكروت — تظهر فقط على الشاشات الأصغر من lg (لابتوبات صغيرة
            الدقة، تابلت، موبايل). كل منتج بقى كارت مستقل تُعرض فيه كل
            البيانات رأسيًا (صورة + اسم فوق، وتحته Grid صغير بالأرقام
            المهمة)، بدل صف عريض في جدول يحتاج سكرول أفقي ليُقرأ كاملًا.
          */}
          {!loading && (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:hidden">
              {products.length === 0 ? (
                <p className="col-span-full py-8 text-center text-muted-foreground">
                  لا توجد منتجات
                </p>
              ) : (
                products.map((p, index) => {
                  const low = p.quantity <= p.minQuantity
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        'rounded-lg border bg-card p-3',
                        !p.active && 'opacity-50'
                      )}
                    >
                      {/* رأس الكارت: تحديد + صورة + اسم + تصنيف */}
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                          className="mt-1"
                        />
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
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
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium leading-tight">{p.name}</p>
                            {!p.active && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                معطل
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.category ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {p.category}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                بدون تصنيف
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-muted-foreground">
                              #{index + 1}
                            </span>
                          </div>
                        </div>
                        {/* إجراءات: نفس أزرار الجدول */}
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="تعديل المنتج"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="المزيد من الإجراءات"
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => printOneLabel(p)}>
                                <Printer className="size-4" />
                                طباعة ملصق باركود
                              </DropdownMenuItem>
                              {capabilities.includes('multi_unit') && (
                                <DropdownMenuItem
                                  onClick={() => setUnitsFor({ id: p.id, name: p.name })}
                                >
                                  <Package className="size-4" />
                                  وحدات الجملة
                                </DropdownMenuItem>
                              )}
                              {capabilities.includes('variants') && (
                                <DropdownMenuItem
                                  onClick={() => setVariantsFor({ id: p.id, name: p.name })}
                                >
                                  <Palette className="size-4" />
                                  الألوان والمقاسات
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => toggleActive(p)}>
                                <Power
                                  className={`size-4 ${p.active ? 'text-muted-foreground' : 'text-success-subtle-foreground'}`}
                                />
                                {p.active ? 'تعطيل المنتج' : 'تفعيل المنتج'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setConfirmId(p.id)}
                              >
                                <Trash2 className="size-4" />
                                حذف نهائي
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* الباركود (لو موجود) */}
                      {p.barcode && (
                        <div className="mt-2 flex justify-center rounded-md border bg-muted/30 py-1.5">
                          <Barcode value={p.barcode} height={24} fontSize={9} fitContainer />
                        </div>
                      )}

                      {/* شبكة البيانات: تكلفة/سعر/كمية/حد أدنى/مبيعات */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">التكلفة</p>
                          <p className="tabular-nums text-muted-foreground">
                            {formatCurrency(p.cost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">السعر</p>
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(p.price)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">المبيعات</p>
                          <p className="font-semibold tabular-nums text-info-subtle-foreground">
                            {p.soldQuantity ?? 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الكمية</p>
                          <p
                            className={cn(
                              'font-semibold tabular-nums',
                              low && 'text-destructive'
                            )}
                          >
                            {p.quantity}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الحد الأدنى</p>
                          <p className="tabular-nums text-muted-foreground">{p.minQuantity}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">الحالة</p>
                          <p
                            className={cn(
                              'text-xs font-medium',
                              low ? 'text-destructive' : 'text-success'
                            )}
                          >
                            {low ? 'منخفض' : 'جيدة'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
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
      <ProductUnitsDialog
        open={!!unitsFor}
        onOpenChange={(o) => !o && setUnitsFor(null)}
        product={unitsFor}
        onChanged={loadProducts}
      />
      <ProductVariantsDialog
        open={!!variantsFor}
        onOpenChange={(o) => !o && setVariantsFor(null)}
        product={variantsFor}
        onChanged={loadProducts}
      />
      <CollectionDiscountDialog
        open={collectionDlg}
        onOpenChange={setCollectionDlg}
        collections={Array.from(new Set(products.map((p:any) => p.collection).filter(Boolean)))}
        onDone={loadProducts}
      />

      {/* simple inline confirm */}
      {confirmId !== null && (
        <ConfirmDialog
          title="حذف المنتج"
          message="هل أنت متأكد من حذف هذا المنتج نهائياً؟ لو المنتج له مبيعات سابقة، استخدم زر التعطيل بدلاً من الحذف."
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
