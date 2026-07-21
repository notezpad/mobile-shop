"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home, ShoppingCart, Package, Users, Wrench, Wallet, Boxes, BarChart3,
  Settings, Bell, Search, Plus, Download, Filter, Eye, Printer, MoreHorizontal,
  Sparkles, Sun, CheckCircle2, Clock, XCircle, ArrowLeft, ArrowRight, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, Breadcrumb } from "@/components/layout/page-header";
import { Topbar, TopbarSearch } from "@/components/layout/topbar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/bento/kpi-card";
import { BentoGrid, BentoCell } from "@/components/layout/bento-grid";
import { Sparkline } from "@/components/charts/sparkline";
import { BarChart } from "@/components/charts/charts";

const NAV = [
  { title: "الرئيسية", items: [
    { label: "لوحة التحكم", href: "/dashboard", icon: <Home /> },
    { label: "نقطة البيع", href: "/pos", icon: <ShoppingCart /> },
    { label: "المنتجات", href: "/products", icon: <Package /> },
    { label: "الفواتير", href: "/invoices", icon: <BarChart3 /> },
  ]},
  { title: "العمليات", items: [
    { label: "المخزون", href: "#", icon: <Boxes /> },
    { label: "العملاء", href: "#", icon: <Users /> },
    { label: "الصيانة", href: "#", icon: <Wrench /> },
    { label: "المالية", href: "#", icon: <Wallet /> },
  ]},
];

const INVOICES = Array.from({ length: 12 }).map((_, i) => {
  const statuses = ["success", "warning", "danger"] as const;
  const methods = ["كاش", "فودافون كاش", "انستاباي", "آجل", "فوري"];
  return {
    id: `INV-${(127 - i).toString().padStart(4, "0")}`,
    customer: ["محمد عبد الله", "أحمد سمير", "شركة النور", "خالد إبراهيم", "عميل نقدي", "سارة محمود", "شركة الفجر", "عمر خالد"][i % 8],
    items: Math.floor(Math.random() * 8) + 1,
    amount: Math.floor(Math.random() * 50000) + 500,
    method: methods[i % methods.length],
    status: statuses[i % 3],
    time: `${Math.floor(Math.random() * 23) + 1} ساعة`,
    date: `2026-07-${(22 - i).toString().padStart(2, "0")}`,
  };
});

export default function InvoicesPage() {
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
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{section.title}</div>
              {section.items.map((item) => {
                const active = item.href === "/invoices";
                return (
                  <Link key={item.label} href={item.href} className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all [&_svg]:size-4 [&_svg]:shrink-0 ${active ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    {active && <span className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-1 rounded-l-full bg-primary" />}
                    {item.icon}<span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Link href="/design-system" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Settings className="size-4" />نظام التصميم
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar>
          <TopbarSearch />
          <div className="mr-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm"><Bell className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm"><Sun className="size-4" /></Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="gradient" size="sm" className="gap-2"><Plus className="size-4" />فاتورة جديدة</Button>
          </div>
        </Topbar>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <PageHeader
            title="الفواتير"
            description="إدارة وتتبع جميع فواتير المبيعات — 1,247 فاتورة"
            breadcrumb={<Breadcrumb items={[{ label: "الرئيسية" }, { label: "الفواتير" }]} />}
            actions={
              <>
                <Button variant="outline" size="sm" className="gap-2"><Download className="size-4" />تصدير Excel</Button>
                <Button variant="outline" size="sm" className="gap-2"><Filter className="size-4" />فلترة</Button>
              </>
            }
          />

          <BentoGrid cols={4}>
            <BentoCell>
              <KpiCard title="إجمالي الفواتير" value="١٬٢٤٧" icon={<BarChart3 />} variant="primary" sparkline={<Sparkline data={[10, 15, 12, 18, 22, 25, 28]} />} />
            </BentoCell>
            <BentoCell>
              <KpiCard title="مكتملة" value="١٬١٨٠" icon={<CheckCircle2 />} variant="success" delta={{ value: "94.6%", direction: "up" }} />
            </BentoCell>
            <BentoCell>
              <KpiCard title="معلّقة" value="٤٢" icon={<Clock />} variant="warning" />
            </BentoCell>
            <BentoCell>
              <KpiCard title="ملغية" value="٢٥" icon={<XCircle />} variant="danger" />
            </BentoCell>
          </BentoGrid>

          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">الكل (1247)</TabsTrigger>
                  <TabsTrigger value="completed">مكتملة</TabsTrigger>
                  <TabsTrigger value="pending">معلّقة</TabsTrigger>
                  <TabsTrigger value="cancelled">ملغية</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mr-auto flex items-center gap-2">
                <Input placeholder="بحث برقم الفاتورة أو العميل..." icon={<Search />} className="w-72" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>العناصر</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {INVOICES.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs font-medium text-primary">{row.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm"><AvatarFallback>{row.customer.slice(0, 2)}</AvatarFallback></Avatar>
                        <span className="font-medium">{row.customer}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm">{row.items} عنصر</Badge>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{row.amount.toLocaleString()} ج.م</TableCell>
                    <TableCell><Badge variant="subtle" size="sm">{row.method}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      <div>{row.date}</div>
                      <div className="text-[10px]">{row.time}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status as "success" | "warning" | "danger"}>
                        {row.status === "success" && <><CheckCircle2 className="size-3" />مكتملة</>}
                        {row.status === "warning" && <><Clock className="size-3" />معلّقة</>}
                        {row.status === "danger" && <><XCircle className="size-3" />ملغية</>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm"><Eye /></Button>
                        <Button variant="ghost" size="icon-sm"><Printer /></Button>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CardContent className="p-4 border-t border-border flex items-center justify-between">
              <p className="text-sm text-muted-foreground">عرض 1-12 من 1,247 فاتورة</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" className="rtl-flip"><ChevronLeft className="size-4" /></Button>
                <Button variant="outline" size="sm" className="bg-primary-subtle text-primary-subtle-foreground">1</Button>
                <Button variant="outline" size="sm">2</Button>
                <Button variant="outline" size="sm">3</Button>
                <span className="text-muted-foreground px-1">...</span>
                <Button variant="outline" size="sm">104</Button>
                <Button variant="outline" size="icon-sm"><ChevronLeft className="size-4 rtl-flip" /></Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
