"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Palette,
  Type,
  Layout,
  Component,
  Sparkles,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkline } from "@/components/charts/sparkline";
import { BarChart, DonutChart } from "@/components/charts/charts";
import { KpiCard } from "@/components/bento/kpi-card";
import { BentoGrid, BentoCell } from "@/components/layout/bento-grid";
import { PageHeader, Breadcrumb } from "@/components/layout/page-header";
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  DollarSign,
  Bell,
  Search,
  Plus,
  Download,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Settings,
  Home,
  Boxes,
  Wallet,
  Wrench,
  BarChart3,
  ChevronLeft,
} from "lucide-react";

const COLORS = [
  { name: "brand-50", hex: "#F4F2FF", token: "--color-brand-50" },
  { name: "brand-100", hex: "#E8E2FF", token: "--color-brand-100" },
  { name: "brand-200", hex: "#D5C9FF", token: "--color-brand-200" },
  { name: "brand-300", hex: "#B7A4FF", token: "--color-brand-300" },
  { name: "brand-400", hex: "#9275FF", token: "--color-brand-400" },
  { name: "brand-500", hex: "#7B4DFF", token: "--color-brand-500" },
  { name: "brand-600", hex: "#6D2BF5", token: "--color-brand-600" },
  { name: "brand-700", hex: "#5E22D9", token: "--color-brand-700" },
  { name: "brand-800", hex: "#4F1DB0", token: "--color-brand-800" },
  { name: "brand-900", hex: "#421A8C", token: "--color-brand-900" },
  { name: "brand-950", hex: "#2A0F5C", token: "--color-brand-950" },
];

const SEMANTIC_COLORS = [
  { name: "Primary", className: "bg-primary text-primary-foreground" },
  { name: "Success", className: "bg-success text-success-foreground" },
  { name: "Warning", className: "bg-warning text-warning-foreground" },
  { name: "Danger", className: "bg-destructive text-destructive-foreground" },
  { name: "Muted", className: "bg-muted text-muted-foreground" },
  { name: "Subtle", className: "bg-primary-subtle text-primary-subtle-foreground" },
];

const TYPE_SCALE = [
  { name: "Display", className: "text-5xl font-bold", sample: "نظام المحل" },
  { name: "H1", className: "text-4xl font-bold", sample: "لوحة التحكم" },
  { name: "H2", className: "text-3xl font-bold", sample: "تقارير المبيعات" },
  { name: "H3", className: "text-2xl font-semibold", sample: "أحدث الفواتير" },
  { name: "H4", className: "text-xl font-semibold", sample: "إدارة المنتجات" },
  { name: "Body Large", className: "text-lg", sample: "هذا نص أساسي بحجم كبير للاستخدام في الفقرات المهمة" },
  { name: "Body", className: "text-base", sample: "هذا نص أساسي عادي يستخدم في معظم المحتوى" },
  { name: "Body Small", className: "text-sm", sample: "هذا نص ثانوي يستخدم للتفاصيل والملاحظات" },
  { name: "Caption", className: "text-xs", sample: "هذا نص توضيحي صغير للوسوم والتفاصيل" },
];

const RADII = [
  { name: "xs", value: "6px", className: "rounded-[6px]" },
  { name: "sm", value: "8px", className: "rounded-[8px]" },
  { name: "md", value: "12px", className: "rounded-[12px]" },
  { name: "lg", value: "16px", className: "rounded-[16px]" },
  { name: "xl", value: "20px", className: "rounded-[20px]" },
  { name: "2xl", value: "24px", className: "rounded-[24px]" },
  { name: "3xl", value: "32px", className: "rounded-[32px]" },
];

export default function DesignSystemPage() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-xl px-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowRight className="size-4 rtl-flip" />
            رجوع
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Sparkles className="size-4 text-white" />
          </div>
          <span className="font-semibold text-sm">Design System</span>
          <Badge variant="subtle" size="sm">v2.0 · 2026</Badge>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="تبديل الوضع"
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-12 space-y-16">
        {/* Hero */}
        <section className="space-y-4">
          <Badge variant="gradient">
            <Sparkles className="size-3" />
            Bento Modern 2026
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            <span className="gradient-text">نظام التصميم</span> الموحّد
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            مرجع بصري وتقني شامل لكل الألوان، الخطوط، المكوّنات، والـ Patterns المستخدمة في المنصة.
            مصمم وفقاً لأحدث اتجاهات 2026 (Apple/Vercel/Linear) مع دعم RTL كامل.
          </p>
        </section>

        {/* TOC */}
        <Card className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: <Palette className="size-4" />, label: "الألوان", href: "#colors" },
              { icon: <Type className="size-4" />, label: "الخطوط", href: "#typography" },
              { icon: <Component className="size-4" />, label: "المكوّنات", href: "#components" },
              { icon: <Layout className="size-4" />, label: "الـ Patterns", href: "#patterns" },
            ].map((t) => (
              <a
                key={t.href}
                href={t.href}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted hover:border-border-strong transition-colors"
              >
                <span className="text-primary">{t.icon}</span>
                {t.label}
              </a>
            ))}
          </div>
        </Card>

        {/* =================== COLORS =================== */}
        <section id="colors" className="space-y-6 scroll-mt-20">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center">
              <Palette className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">نظام الألوان</h2>
              <p className="text-sm text-muted-foreground">Violet + Neutral مع دعم Light/Dark</p>
            </div>
          </div>

          {/* Brand Scale */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Scale — Violet</CardTitle>
              <CardDescription>
                11 درجة من brand-50 إلى brand-950. الأسماء تستخدم بصيغة oklch لدقة لونية أفضل.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-11 gap-2">
                {COLORS.map((c) => (
                  <div key={c.name} className="space-y-1.5">
                    <div
                      className="aspect-square rounded-lg border border-border/50 shadow-xs"
                      style={{ backgroundColor: c.hex }}
                    />
                    <div className="text-center">
                      <p className="text-[10px] font-mono text-foreground">{c.name}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{c.hex}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Semantic */}
          <Card>
            <CardHeader>
              <CardTitle>Semantic Tokens</CardTitle>
              <CardDescription>
                الأسماء الدلالية تربط الألوان بوظائفها — أسهل للصيانة وأكثر مرونة عند تغيير الثيم.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {SEMANTIC_COLORS.map((c) => (
                  <div key={c.name} className="space-y-2">
                    <div
                      className={`${c.className} h-20 rounded-lg flex items-end p-2 text-xs font-medium`}
                    >
                      {c.name}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Status Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Status Indicators</CardTitle>
              <CardDescription>نقاط الحالة للاستخدام في الجداول والقوائم</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                {[
                  { status: "success" as const, label: "نشط / مكتمل" },
                  { status: "warning" as const, label: "معلّق / منخفض" },
                  { status: "danger" as const, label: "خطأ / متوقف" },
                  { status: "primary" as const, label: "جديد" },
                  { status: "neutral" as const, label: "محايد" },
                ].map((s) => (
                  <div key={s.status} className="flex items-center gap-2">
                    <StatusDot status={s.status} pulse={s.status === "warning"} />
                    <span className="text-sm">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">مكتملة</Badge>
                <Badge variant="warning">منخفض المخزون</Badge>
                <Badge variant="danger">ملغية</Badge>
                <Badge variant="subtle">مسودة</Badge>
                <Badge variant="gradient">جديد</Badge>
                <Badge variant="outline">ثانوي</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* =================== TYPOGRAPHY =================== */}
        <section id="typography" className="space-y-6 scroll-mt-20">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center">
              <Type className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">نظام الخطوط</h2>
              <p className="text-sm text-muted-foreground">IBM Plex Sans Arabic — 9 مستويات هرمية</p>
            </div>
          </div>

          <Card>
            <CardContent className="py-6 space-y-4 divide-y divide-border">
              {TYPE_SCALE.map((t) => (
                <div key={t.name} className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-6 pt-4 first:pt-0">
                  <div className="md:w-32 shrink-0">
                    <p className="text-xs font-mono text-muted-foreground">{t.name}</p>
                  </div>
                  <div className={`${t.className} flex-1`}>{t.sample}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* =================== COMPONENTS =================== */}
        <section id="components" className="space-y-6 scroll-mt-20">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center">
              <Component className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">المكوّنات</h2>
              <p className="text-sm text-muted-foreground">+25 مكوّن أساسي بدعم RTL كامل</p>
            </div>
          </div>

          {/* Buttons */}
          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>7 variants × 6 sizes مع حالات hover و active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground">Variants</p>
                <div className="flex flex-wrap gap-3">
                  <Button>Default</Button>
                  <Button variant="gradient">Gradient</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="subtle">Subtle</Button>
                  <Button variant="link">Link</Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground">Sizes</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">صغير</Button>
                  <Button size="default">افتراضي</Button>
                  <Button size="lg">كبير</Button>
                  <Button size="xl">ضخم</Button>
                  <Button size="icon" aria-label="add"><Plus /></Button>
                  <Button size="icon-sm" aria-label="add"><Plus /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground">مع أيقونات</p>
                <div className="flex flex-wrap gap-3">
                  <Button className="gap-2">
                    <Plus className="size-4" />
                    منتج جديد
                  </Button>
                  <Button variant="outline" className="gap-2">
                    <Download className="size-4" />
                    تصدير
                  </Button>
                  <Button variant="subtle" className="gap-2">
                    <Filter className="size-4" />
                    فلترة
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Badges */}
          <Card>
            <CardHeader>
              <CardTitle>Badges</CardTitle>
              <CardDescription>للحالات والوسوم والإشارات</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="subtle">Subtle</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
                <Badge variant="gradient">Gradient</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Inputs */}
          <Card>
            <CardHeader>
              <CardTitle>Inputs & Forms</CardTitle>
              <CardDescription>حقول الإدخال مع حالاتها</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="اسم المنتج" required>
                  <Input placeholder="مثال: آيفون 15 برو" />
                </Field>
                <Field label="الباركود" hint="اختياري">
                  <Input placeholder="6290123456789" icon={<Search />} />
                </Field>
                <Field label="السعر" required>
                  <Input type="number" placeholder="0.00" />
                </Field>
                <Field label="الحالة">
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-border bg-card">
                    <Switch defaultChecked />
                    <span className="text-sm">نشط</span>
                  </div>
                </Field>
                <Field label="ملاحظات" className="md:col-span-2">
                  <Textarea placeholder="أي تفاصيل إضافية..." />
                </Field>
                <Field label="حقل بخطأ" error="هذا الحقل مطلوب">
                  <Input error placeholder="..." />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Avatars */}
          <Card>
            <CardHeader>
              <CardTitle>Avatars</CardTitle>
              <CardDescription>3 أحجام مع fallback تلقائي</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarFallback>أم</AvatarFallback>
                </Avatar>
                <Avatar size="default">
                  <AvatarFallback>محمد</AvatarFallback>
                </Avatar>
                <Avatar size="lg">
                  <AvatarFallback>ع</AvatarFallback>
                </Avatar>
                <div className="flex -space-x-3 space-x-reverse">
                  {["أ", "ب", "ج", "د"].map((l, i) => (
                    <Avatar key={i} size="sm" className="ring-2 ring-card">
                      <AvatarFallback style={{
                        background: `linear-gradient(135deg, hsl(${260 + i * 30} 70% 60%), hsl(${280 + i * 30} 70% 50%))`
                      }}>
                        {l}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  <div className="size-8 rounded-full ring-2 ring-card bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    +5
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>للتحميل والعمليات والمؤشرات</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">استخدام الباقة</span>
                  <span className="font-medium tabular-nums">340 / 500</span>
                </div>
                <Progress value={68} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">مساحة التخزين</span>
                  <span className="font-medium text-success tabular-nums">85%</span>
                </div>
                <Progress value={85} indicatorClassName="bg-success" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">تنبيه المخزون</span>
                  <span className="font-medium text-warning tabular-nums">92%</span>
                </div>
                <Progress value={92} indicatorClassName="bg-warning" size="lg" />
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Tabs</CardTitle>
              <CardDescription>لتبويب المحتوى داخل الصفحة</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
                  <TabsTrigger value="sales">المبيعات</TabsTrigger>
                  <TabsTrigger value="inventory">المخزون</TabsTrigger>
                  <TabsTrigger value="reports">التقارير</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                  محتوى تبويب نظرة عامة — يعرض ملخص الأرقام والمؤشرات الرئيسية.
                </TabsContent>
                <TabsContent value="sales" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                  محتوى تبويب المبيعات — يعرض قائمة الفواتير والإحصائيات.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Table</CardTitle>
              <CardDescription>جدول بيانات مع حالات hover و selected</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { name: "آيفون 15 برو", cat: "موبايل", qty: 24, price: "62,000 ج.م", status: "success" as const, label: "متوفر" },
                    { name: "سامسونج A55", cat: "موبايل", qty: 8, price: "18,500 ج.م", status: "warning" as const, label: "منخفض" },
                    { name: "شاحن Anker 65W", cat: "إكسسوارات", qty: 0, price: "1,200 ج.م", status: "danger" as const, label: "نفذ" },
                    { name: "كابل Type-C", cat: "إكسسوارات", qty: 145, price: "150 ج.م", status: "success" as const, label: "متوفر" },
                  ].map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.cat}</TableCell>
                      <TableCell className="tabular-nums">{row.qty}</TableCell>
                      <TableCell className="tabular-nums font-medium">{row.price}</TableCell>
                      <TableCell>
                        <Badge variant={row.status}>{row.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm"><Eye /></Button>
                          <Button variant="ghost" size="icon-sm"><Edit /></Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive"><Trash2 /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* =================== PATTERNS =================== */}
        <section id="patterns" className="space-y-6 scroll-mt-20">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center">
              <Layout className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">الـ Patterns</h2>
              <p className="text-sm text-muted-foreground">أنماط جاهزة للاستخدام في الصفحات</p>
            </div>
          </div>

          {/* KPI Cards Pattern */}
          <Card>
            <CardHeader>
              <CardTitle>KPI Cards Pattern</CardTitle>
              <CardDescription>بطاقات المؤشرات الرئيسية مع Delta و Sparkline</CardDescription>
            </CardHeader>
            <CardContent>
              <BentoGrid cols={4}>
                <BentoCell>
                  <KpiCard
                    title="مبيعات اليوم"
                    value="٤٢٬٨٠٠ ج.م"
                    delta={{ value: "12.5%", direction: "up", label: "عن الأمس" }}
                    icon={<DollarSign />}
                    variant="primary"
                    sparkline={<Sparkline data={[20, 35, 28, 42, 38, 55, 48]} />}
                  />
                </BentoCell>
                <BentoCell>
                  <KpiCard
                    title="الفواتير"
                    value="١٢٧"
                    delta={{ value: "8%", direction: "up" }}
                    icon={<ShoppingCart />}
                    variant="success"
                    sparkline={<Sparkline data={[10, 15, 12, 18, 22, 19, 25]} color="var(--success)" />}
                  />
                </BentoCell>
                <BentoCell>
                  <KpiCard
                    title="المنتجات"
                    value="٤٨٠"
                    delta={{ value: "3%", direction: "down", label: "هذا الشهر" }}
                    icon={<Package />}
                    variant="default"
                  />
                </BentoCell>
                <BentoCell>
                  <KpiCard
                    title="أرصدة الآجل"
                    value="١٢٬٤٠٠ ج.م"
                    delta={{ value: "5%", direction: "up" }}
                    icon={<Users />}
                    variant="warning"
                  />
                </BentoCell>
              </BentoGrid>
            </CardContent>
          </Card>

          {/* Bento Dashboard Pattern */}
          <Card>
            <CardHeader>
              <CardTitle>Bento Dashboard Layout</CardTitle>
              <CardDescription>تخطيط شبكي غير متماثل بستايل Apple/Vercel 2026</CardDescription>
            </CardHeader>
            <CardContent>
              <BentoGrid cols={3}>
                <BentoCell colSpan={2}>
                  <div className="rounded-2xl border border-border bg-card-muted p-6 h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">مبيعات آخر 7 أيام</p>
                        <p className="text-2xl font-bold mt-1 tabular-nums">٢٤٨٬٥٠٠ ج.م</p>
                      </div>
                      <Badge variant="success">
                        <TrendingUp className="size-3" />
                        +18.2%
                      </Badge>
                    </div>
                    <BarChart
                      data={[
                        { label: "سبت", value: 32 },
                        { label: "أحد", value: 45 },
                        { label: "إثنين", value: 38 },
                        { label: "ثلاثاء", value: 52 },
                        { label: "أربعاء", value: 48 },
                        { label: "خميس", value: 65 },
                        { label: "جمعة", value: 72 },
                      ]}
                      height={180}
                    />
                  </div>
                </BentoCell>
                <BentoCell rowSpan={2}>
                  <div className="rounded-2xl border border-border bg-card p-6 h-full flex flex-col items-center justify-center gap-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider self-start">طرق الدفع</p>
                    <DonutChart
                      data={[
                        { label: "كاش", value: 45 },
                        { label: "فودافون كاش", value: 30 },
                        { label: "انستاباي", value: 15 },
                        { label: "فوري", value: 10 },
                      ]}
                      size={180}
                      centerValue="١٠٠٪"
                      centerLabel="إجمالي"
                    />
                    <div className="w-full space-y-2">
                      {[
                        { label: "كاش", value: "45%", color: "var(--chart-1)" },
                        { label: "فودافون كاش", value: "30%", color: "var(--chart-2)" },
                        { label: "انستاباي", value: "15%", color: "var(--chart-3)" },
                        { label: "فوري", value: "10%", color: "var(--chart-4)" },
                      ].map((d) => (
                        <div key={d.label} className="flex items-center gap-2 text-sm">
                          <span className="size-2 rounded-full" style={{ background: d.color }} />
                          <span className="flex-1 text-muted-foreground">{d.label}</span>
                          <span className="font-medium tabular-nums">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </BentoCell>
                <BentoCell>
                  <div className="rounded-2xl border border-border bg-card p-6 h-full">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">تنبيهات المخزون</p>
                    <p className="text-3xl font-bold tabular-nums">٧</p>
                    <p className="text-sm text-muted-foreground mt-1">منتج وصل للحد الأدنى</p>
                    <div className="mt-4 space-y-2">
                      {["شاحن Anker", "سامسونج A55", "كابل Lightning"].map((p) => (
                        <div key={p} className="flex items-center gap-2 text-xs">
                          <StatusDot status="warning" />
                          <span className="text-muted-foreground">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </BentoCell>
                <BentoCell>
                  <div className="rounded-2xl border border-border bg-card p-6 h-full">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">صيانة قيد التنفيذ</p>
                    <p className="text-3xl font-bold tabular-nums">٤</p>
                    <p className="text-sm text-muted-foreground mt-1">أجهزة في الانتظار</p>
                    <Button variant="subtle" size="sm" className="mt-4 w-full">عرض الكل</Button>
                  </div>
                </BentoCell>
              </BentoGrid>
            </CardContent>
          </Card>

          {/* Sidebar Pattern */}
          <Card>
            <CardHeader>
              <CardTitle>Sidebar Navigation Pattern</CardTitle>
              <CardDescription>قائمة جانبية بـ active states وsection labels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[400px] rounded-xl border border-border overflow-hidden" dir="rtl">
                <aside className="w-[240px] bg-sidebar border-l border-sidebar-border flex flex-col">
                  <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
                    <div className="size-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center ml-2">
                      <Sparkles className="size-4 text-white" />
                    </div>
                    <span className="font-semibold text-sm">محل الاتصالات</span>
                  </div>
                  <nav className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
                    <div className="space-y-1">
                      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">الرئيسية</div>
                      {[
                        { label: "لوحة التحكم", icon: <Home />, active: true },
                        { label: "نقطة البيع", icon: <ShoppingCart /> },
                        { label: "المنتجات", icon: <Package /> },
                      ].map((item) => (
                        <a key={item.label} href="#" className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${item.active ? "bg-primary-subtle text-primary-subtle-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                          {item.active && <span className="absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-1 rounded-l-full bg-primary" />}
                          <span className="[&>svg]:size-4">{item.icon}</span>
                          <span>{item.label}</span>
                        </a>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">العمليات</div>
                      {[
                        { label: "الفواتير", icon: <BarChart3 /> },
                        { label: "المخزون", icon: <Boxes /> },
                        { label: "الصيانة", icon: <Wrench /> },
                        { label: "المالية", icon: <Wallet /> },
                      ].map((item) => (
                        <a key={item.label} href="#" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <span className="[&>svg]:size-4">{item.icon}</span>
                          <span>{item.label}</span>
                        </a>
                      ))}
                    </div>
                  </nav>
                </aside>
                <div className="flex-1 bg-background p-6">
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">Main Content Area</p>
                    <p>هنا يعرض المحتوى الرئيسي للصفحة المختارة من الـ Sidebar.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* =================== MOTION & RADII =================== */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">الحركة والزوايا</h2>
              <p className="text-sm text-muted-foreground">Motion tokens و Radius scale</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Radius Scale</CardTitle>
                <CardDescription>7 مستويات من الزوايا الدائرية</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-3">
                  {RADII.map((r) => (
                    <div key={r.name} className="space-y-1.5">
                      <div className={`${r.className} aspect-square bg-primary-subtle border-2 border-primary/30`} />
                      <div className="text-center">
                        <p className="text-xs font-mono">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{r.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Motion Tokens</CardTitle>
                <CardDescription>Easing curves و Durations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-mono text-xs">--ease-spring</span>
                    <span className="text-muted-foreground">cubic-bezier(0.34, 1.56, 0.64, 1)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{
                      animation: "scale-in 1s var(--ease-spring) infinite alternate"
                    }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: "fast", value: "150ms" },
                    { name: "base", value: "220ms" },
                    { name: "slow", value: "380ms" },
                  ].map((d) => (
                    <div key={d.name} className="rounded-lg border border-border p-3 text-center">
                      <p className="text-xs font-mono text-muted-foreground">{d.name}</p>
                      <p className="text-sm font-semibold tabular-nums">{d.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <Card className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Check className="size-4 text-success" />
            <span className="font-medium">نظام تصميم جاهز للاستخدام</span>
          </div>
          <p className="text-sm text-muted-foreground">
            جميع المكوّنات والـ Patterns قابلة للنسخ والتطبيق مباشرة في أي صفحة من المنصة.
          </p>
        </Card>
      </div>
    </div>
  );
}
