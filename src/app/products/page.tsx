"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home, ShoppingCart, Package, Users, Wrench, Wallet, Boxes, BarChart3,
  Settings, Bell, Search, Plus, Download, Filter, MoreHorizontal, Eye, Edit, Trash2,
  Sparkles, Sun, ArrowLeft, Grid3x3, List, ChevronLeft, ChevronRight, Package2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, Breadcrumb } from "@/components/layout/page-header";
import { Topbar, TopbarSearch } from "@/components/layout/topbar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

const PRODUCTS = [
  { name: "آيفون 15 برو ماكس", cat: "موبايل", brand: "Apple", qty: 24, min: 5, cost: 58000, price: 62000, img: "IPH", status: "success" as const },
  { name: "سامسونج جالاكسي A55", cat: "موبايل", brand: "Samsung", qty: 8, min: 10, cost: 16000, price: 18500, img: "SAM", status: "warning" as const },
  { name: "شاحن Anker 65W", cat: "إكسسوارات", brand: "Anker", qty: 0, min: 5, cost: 850, price: 1200, img: "ANK", status: "danger" as const },
  { name: "كابل Type-C سريع", cat: "إكسسوارات", brand: "Baseus", qty: 145, min: 20, cost: 90, price: 150, img: "CAB", status: "success" as const },
  { name: "سماعة AirPods Pro 2", cat: "سماعات", brand: "Apple", qty: 12, min: 3, cost: 6500, price: 7800, img: "AIR", status: "success" as const },
  { name: "باور بانك 20000mAh", cat: "إكسسوارات", brand: "Xiaomi", qty: 6, min: 8, cost: 700, price: 1100, img: "PWR", status: "warning" as const },
  { name: "ساعة Apple Watch S9", cat: "ساعات", brand: "Apple", qty: 5, min: 2, cost: 14000, price: 16500, img: "WCH", status: "success" as const },
  { name: "جراب شفاف لآيفون", cat: "إكسسوارات", brand: "Generic", qty: 0, min: 15, cost: 35, price: 80, img: "CAS", status: "danger" as const },
];

export default function ProductsPage() {
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
                const active = item.href === "/products";
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
            <Button variant="gradient" size="sm" className="gap-2"><Plus className="size-4" />منتج جديد</Button>
          </div>
        </Topbar>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <PageHeader
            title="المنتجات"
            description="إدارة كتالوج المنتجات والمخزون — 480 منتج"
            breadcrumb={<Breadcrumb items={[{ label: "الرئيسية" }, { label: "المنتجات" }]} />}
            actions={
              <>
                <Button variant="outline" size="sm" className="gap-2"><Download className="size-4" />تصدير</Button>
                <Button variant="outline" size="sm" className="gap-2"><Filter className="size-4" />فلترة</Button>
              </>
            }
          />

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "إجمالي المنتجات", value: "٤٨٠", color: "var(--primary)" },
              { label: "متوفر", value: "٤١٢", color: "var(--success)" },
              { label: "منخفض المخزون", value: "١٥", color: "var(--warning)" },
              { label: "نفذ من المخزون", value: "٨", color: "var(--destructive)" },
            ].map((s, i) => (
              <Card key={i} variant="bento" className="p-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15`, color: s.color }}>
                    <Package2 className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Toolbar */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">الكل (480)</TabsTrigger>
                  <TabsTrigger value="available">متوفر (412)</TabsTrigger>
                  <TabsTrigger value="low">منخفض (15)</TabsTrigger>
                  <TabsTrigger value="out">نفذ (8)</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mr-auto flex items-center gap-2">
                <Input placeholder="بحث بالاسم أو الباركود..." icon={<Search />} className="w-64" />
                <Button variant="outline" size="icon" aria-label="grid"><Grid3x3 className="size-4" /></Button>
                <Button variant="outline" size="icon" aria-label="list"><List className="size-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>التصنيف</TableHead>
                  <TableHead>الماركة</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>التكلفة</TableHead>
                  <TableHead>سعر البيع</TableHead>
                  <TableHead>الربح</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PRODUCTS.map((p, i) => {
                  const profit = p.price - p.cost;
                  const profitPct = ((profit / p.cost) * 100).toFixed(0);
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300">
                            {p.img}
                          </div>
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">SKU-{1000 + i}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" size="sm">{p.cat}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{p.brand}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">{p.qty}</span>
                          <span className="text-xs text-muted-foreground">/ {p.min}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{p.cost.toLocaleString()} ج.م</TableCell>
                      <TableCell className="font-semibold tabular-nums">{p.price.toLocaleString()} ج.م</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-success tabular-nums">+{profit.toLocaleString()}</span>
                          <span className="text-xs text-muted-foreground">{profitPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.status}>
                          {p.status === "success" && "متوفر"}
                          {p.status === "warning" && "منخفض"}
                          {p.status === "danger" && "نفذ"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm"><Eye /></Button>
                          <Button variant="ghost" size="icon-sm"><Edit /></Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive"><Trash2 /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <CardContent className="p-4 border-t border-border flex items-center justify-between">
              <p className="text-sm text-muted-foreground">عرض 1-8 من 480 منتج</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm"><ChevronRight className="size-4 rtl-flip" /></Button>
                <Button variant="outline" size="sm">1</Button>
                <Button variant="outline" size="sm" className="bg-primary-subtle text-primary-subtle-foreground">2</Button>
                <Button variant="outline" size="sm">3</Button>
                <span className="text-muted-foreground px-1">...</span>
                <Button variant="outline" size="sm">60</Button>
                <Button variant="outline" size="icon-sm"><ChevronLeft className="size-4 rtl-flip" /></Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
