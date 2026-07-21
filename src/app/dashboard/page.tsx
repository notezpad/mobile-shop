"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home, ShoppingCart, Package, Users, Wrench, Wallet, Boxes, BarChart3,
  Settings, Bell, Search, Plus, Download, Filter, TrendingUp, TrendingDown,
  DollarSign, ArrowLeft, ChevronLeft, MoreHorizontal, Eye, AlertTriangle,
  Clock, CheckCircle2, Sparkles, Sun, Moon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KpiCard } from "@/components/bento/kpi-card";
import { BentoGrid, BentoCell } from "@/components/layout/bento-grid";
import { PageHeader, Breadcrumb } from "@/components/layout/page-header";
import { Topbar, TopbarSearch } from "@/components/layout/topbar";
import { Sparkline } from "@/components/charts/sparkline";
import { BarChart, DonutChart } from "@/components/charts/charts";
import { Separator } from "@/components/ui/separator";

const NAV = [
  {
    title: "الرئيسية",
    items: [
      { label: "لوحة التحكم", href: "/dashboard", icon: <Home /> },
      { label: "نقطة البيع", href: "/pos", icon: <ShoppingCart /> },
      { label: "المنتجات", href: "/products", icon: <Package /> },
      { label: "الفواتير", href: "/invoices", icon: <BarChart3 /> },
    ],
  },
  {
    title: "العمليات",
    items: [
      { label: "المخزون", href: "#", icon: <Boxes /> },
      { label: "العملاء", href: "#", icon: <Users /> },
      { label: "الصيانة", href: "#", icon: <Wrench /> },
      { label: "المالية", href: "#", icon: <Wallet /> },
    ],
  },
];

export default function DashboardPage() {
  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      <aside className="w-[260px] bg-sidebar border-l border-sidebar-border flex flex-col shrink-0">
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
          <div className="size-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center ml-3 shadow-sm">
            <Sparkles className="size-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold leading-tight">محل الاتصالات</p>
            <p className="text-[10px] text-muted-foreground">باقة احترافي</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </div>
              {section.items.map((item) => {
                const active = item.href === "/dashboard";
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all [&_svg]:size-4 [&_svg]:shrink-0 ${
                      active
                        ? "bg-primary-subtle text-primary-subtle-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {active && (
                      <span className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-l-full bg-primary" />
                    )}
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {item.label === "الصيانة" && <Badge variant="warning" size="sm">4</Badge>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Link href="/design-system" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Settings className="size-4" />
            نظام التصميم
          </Link>
          <div className="mt-2 flex items-center gap-3 rounded-lg p-2 hover:bg-muted transition-colors cursor-pointer">
            <Avatar size="sm"><AvatarFallback>أم</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">أحمد محمود</p>
              <p className="text-[10px] text-muted-foreground truncate">admin@demo.com</p>
            </div>
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar>
          <TopbarSearch />
          <div className="mr-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="alerts" className="relative">
              <Bell className="size-4" />
              <span className="absolute top-1 right-1 size-2 rounded-full bg-destructive ring-2 ring-background" />
            </Button>
            <Button variant="ghost" size="icon-sm"><Sun className="size-4" /></Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="gradient" size="sm" className="gap-2">
              <Plus className="size-4" />
              بيع سريع
            </Button>
          </div>
        </Topbar>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <PageHeader
            title="لوحة التحكم"
            description="مرحباً أحمد — هذه نظرة سريعة على أداء محلك اليوم"
            breadcrumb={<Breadcrumb items={[{ label: "الرئيسية" }, { label: "لوحة التحكم" }]} />}
            actions={
              <>
                <Button variant="outline" size="sm" className="gap-2"><Download className="size-4" />تصدير</Button>
                <Button variant="outline" size="sm" className="gap-2"><Filter className="size-4" />فلترة</Button>
              </>
            }
          />

          <BentoGrid cols={4}>
            <BentoCell className="animate-in stagger-1">
              <KpiCard title="مبيعات اليوم" value="٤٢٬٨٠٠ ج.م" delta={{ value: "12.5%", direction: "up", label: "عن الأمس" }} icon={<DollarSign />} variant="primary" sparkline={<Sparkline data={[20, 35, 28, 42, 38, 55, 48]} />} />
            </BentoCell>
            <BentoCell className="animate-in stagger-2">
              <KpiCard title="فواتير اليوم" value="١٢٧" delta={{ value: "8%", direction: "up" }} icon={<ShoppingCart />} variant="success" sparkline={<Sparkline data={[10, 15, 12, 18, 22, 19, 25]} color="var(--success)" />} />
            </BentoCell>
            <BentoCell className="animate-in stagger-3">
              <KpiCard title="صافي الربح" value="٨٬٦٤٠ ج.م" delta={{ value: "3%", direction: "down", label: "هذا الشهر" }} icon={<TrendingUp />} variant="warning" />
            </BentoCell>
            <BentoCell className="animate-in stagger-4">
              <KpiCard title="أرصدة الآجل" value="١٢٬٤٠٠ ج.م" delta={{ value: "5%", direction: "up" }} icon={<Users />} variant="default" />
            </BentoCell>
          </BentoGrid>

          <BentoGrid cols={3}>
            <BentoCell colSpan={2} className="animate-in stagger-2">
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>مبيعات آخر 7 أيام</CardTitle>
                    <CardDescription>إجمالي ٢٤٨٬٥٠٠ ج.م · +18.2% عن الأسبوع الماضي</CardDescription>
                  </div>
                  <Badge variant="success"><TrendingUp className="size-3" />+18.2%</Badge>
                </CardHeader>
                <CardContent>
                  <BarChart data={[{ label: "سبت", value: 32 }, { label: "أحد", value: 45 }, { label: "إثنين", value: 38 }, { label: "ثلاثاء", value: 52 }, { label: "أربعاء", value: 48 }, { label: "خميس", value: 65 }, { label: "جمعة", value: 72 }]} height={220} />
                </CardContent>
              </Card>
            </BentoCell>

            <BentoCell rowSpan={2} className="animate-in stagger-3">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>طرق الدفع</CardTitle>
                  <CardDescription>توزيع معاملات اليوم</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-6">
                  <DonutChart data={[{ label: "كاش", value: 45 }, { label: "فودافون كاش", value: 30 }, { label: "انستاباي", value: 15 }, { label: "فوري", value: 10 }]} size={180} centerValue="١٢٧" centerLabel="معاملة" />
                  <div className="w-full space-y-2.5">
                    {[{ label: "كاش", value: "45%", color: "var(--chart-1)", count: "57 معاملة" }, { label: "فودافون كاش", value: "30%", color: "var(--chart-2)", count: "38 معاملة" }, { label: "انستاباي", value: "15%", color: "var(--chart-3)", count: "19 معاملة" }, { label: "فوري", value: "10%", color: "var(--chart-4)", count: "13 معاملة" }].map((d) => (
                      <div key={d.label} className="flex items-center gap-2 text-sm">
                        <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="flex-1 text-foreground font-medium">{d.label}</span>
                        <span className="text-xs text-muted-foreground">{d.count}</span>
                        <span className="font-semibold tabular-nums w-10 text-left">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </BentoCell>

            <BentoCell className="animate-in stagger-4">
              <Card variant="bento" className="h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg bg-warning-subtle text-warning-subtle-foreground flex items-center justify-center"><AlertTriangle className="size-4" /></div>
                      <span className="text-sm font-medium">تنبيهات المخزون</span>
                    </div>
                    <Badge variant="warning" size="sm">7</Badge>
                  </div>
                  <div className="space-y-2">
                    {[{ name: "شاحن Anker 65W", qty: 2 }, { name: "سامسونج A55", qty: 3 }, { name: "كابل Lightning", qty: 4 }].map((p) => (
                      <div key={p.name} className="flex items-center gap-2 text-xs">
                        <StatusDot status="warning" />
                        <span className="flex-1 text-muted-foreground truncate">{p.name}</span>
                        <span className="font-mono text-foreground">{p.qty} متبقي</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="subtle" size="sm" className="w-full">عرض الكل</Button>
                </CardContent>
              </Card>
            </BentoCell>

            <BentoCell className="animate-in stagger-5">
              <Card variant="bento" className="h-full">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg bg-primary-subtle text-primary-subtle-foreground flex items-center justify-center"><Wrench className="size-4" /></div>
                      <span className="text-sm font-medium">حالات الصيانة</span>
                    </div>
                    <Badge variant="subtle" size="sm">4</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-xl font-bold tabular-nums">٢</p><p className="text-[10px] text-muted-foreground">جديدة</p></div>
                    <div><p className="text-xl font-bold tabular-nums text-warning">١</p><p className="text-[10px] text-muted-foreground">قيد التنفيذ</p></div>
                    <div><p className="text-xl font-bold tabular-nums text-success">١</p><p className="text-[10px] text-muted-foreground">جاهزة</p></div>
                  </div>
                  <Button variant="subtle" size="sm" className="w-full">إدارة الصيانة</Button>
                </CardContent>
              </Card>
            </BentoCell>
          </BentoGrid>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>أحدث الفواتير</CardTitle>
                <CardDescription>آخر 5 معاملات مبيعات</CardDescription>
              </div>
              <Link href="/invoices">
                <Button variant="outline" size="sm" className="gap-2">عرض الكل<ArrowLeft className="size-4 rtl-flip" /></Button>
              </Link>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>الوقت</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { id: "INV-0127", customer: "محمد عبد الله", time: "منذ 5 دقائق", amount: "12,500 ج.م", method: "كاش", status: "success" as const, label: "مكتملة" },
                    { id: "INV-0126", customer: "أحمد سمير", time: "منذ 18 دقيقة", amount: "3,200 ج.م", method: "فودافون كاش", status: "success" as const, label: "مكتملة" },
                    { id: "INV-0125", customer: "شركة النور", time: "منذ 45 دقيقة", amount: "48,000 ج.م", method: "آجل", status: "warning" as const, label: "معلّقة" },
                    { id: "INV-0124", customer: "خالد إبراهيم", time: "منذ ساعة", amount: "850 ج.م", method: "انستاباي", status: "success" as const, label: "مكتملة" },
                    { id: "INV-0123", customer: "عميل نقدي", time: "منذ ساعتين", amount: "1,400 ج.م", method: "كاش", status: "success" as const, label: "مكتملة" },
                  ].map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm"><AvatarFallback>{row.customer.slice(0, 2)}</AvatarFallback></Avatar>
                          <span className="font-medium">{row.customer}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.time}</TableCell>
                      <TableCell className="font-semibold tabular-nums">{row.amount}</TableCell>
                      <TableCell><Badge variant="outline" size="sm">{row.method}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={row.status}>
                          {row.status === "success" && <CheckCircle2 className="size-3" />}
                          {row.status === "warning" && <Clock className="size-3" />}
                          {row.label}
                        </Badge>
                      </TableCell>
                      <TableCell><Button variant="ghost" size="icon-sm"><Eye /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
