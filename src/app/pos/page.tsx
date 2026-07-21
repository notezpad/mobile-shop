"use client";

import * as React from "react";
import Link from "next/link";
import {
  Home, ShoppingCart, Package, Users, Wrench, Boxes, BarChart3,
  Settings, Bell, Search, Plus, Minus, Trash2, X, Sparkles, Sun,
  Barcode, CreditCard, Wallet, Banknote, Smartphone, Printer, Tag, Percent, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  { name: "آيفون 15 برو", price: 62000, img: "IPH", cat: "موبايل" },
  { name: "سامسونج A55", price: 18500, img: "SAM", cat: "موبايل" },
  { name: "شاحن Anker 65W", price: 1200, img: "ANK", cat: "إكسسوارات" },
  { name: "كابل Type-C", price: 150, img: "CAB", cat: "إكسسوارات" },
  { name: "AirPods Pro 2", price: 7800, img: "AIR", cat: "سماعات" },
  { name: "باور بانك 20K", price: 1100, img: "PWR", cat: "إكسسوارات" },
  { name: "Apple Watch S9", price: 16500, img: "WCH", cat: "ساعات" },
  { name: "جراب شفاف", price: 80, img: "CAS", cat: "إكسسوارات" },
];

interface CartItem { name: string; price: number; qty: number; img: string; }

export default function POSPage() {
  const [cart, setCart] = React.useState<CartItem[]>([
    { name: "آيفون 15 برو", price: 62000, qty: 1, img: "IPH" },
    { name: "AirPods Pro 2", price: 7800, qty: 2, img: "AIR" },
    { name: "كابل Type-C", price: 150, qty: 3, img: "CAB" },
  ]);
  const [payMethod, setPayMethod] = React.useState("cash");

  const add = (p: typeof PRODUCTS[0]) => setCart((c) => {
    const existing = c.find((i) => i.name === p.name);
    if (existing) return c.map((i) => i.name === p.name ? { ...i, qty: i.qty + 1 } : i);
    return [...c, { name: p.name, price: p.price, qty: 1, img: p.img }];
  });
  const inc = (name: string) => setCart((c) => c.map((i) => i.name === name ? { ...i, qty: i.qty + 1 } : i));
  const dec = (name: string) => setCart((c) => c.flatMap((i) => i.name === name ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i]));
  const remove = (name: string) => setCart((c) => c.filter((i) => i.name !== name));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * 0.14;
  const total = subtotal + tax;

  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      <aside className="w-[72px] bg-sidebar border-l border-sidebar-border flex flex-col items-center py-4 gap-2 shrink-0">
        <div className="size-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mb-4 shadow-sm">
          <Sparkles className="size-5 text-white" />
        </div>
        {NAV.flatMap((s) => s.items).map((item, i) => {
          const active = item.href === "/pos";
          return (
            <Link key={i} href={item.href} className={`relative flex size-11 items-center justify-center rounded-xl transition-colors [&_svg]:size-5 ${active ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {active && <span className="absolute -right-4 top-1/2 -translate-y-1/2 h-6 w-1 rounded-l-full bg-primary" />}
              {item.icon}
            </Link>
          );
        })}
        <div className="mt-auto">
          <Link href="/design-system" className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Settings className="size-5" />
          </Link>
          <Avatar size="sm" className="mt-2"><AvatarFallback>أم</AvatarFallback></Avatar>
        </div>
      </aside>

      {/* Products grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-16 border-b border-border bg-background/80 backdrop-blur-xl flex items-center gap-3 px-6">
          <div className="relative w-full max-w-md">
            <Input placeholder="امسح الباركود أو ابحث عن منتج..." icon={<Barcode />} className="h-10" autoFocus />
          </div>
          <Badge variant="subtle" className="gap-1.5"><Tag className="size-3" />8 أقسام</Badge>
          <div className="mr-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm"><Bell className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm"><Sun className="size-4" /></Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap gap-2 mb-6">
            {["الكل", "موبايل", "إكسسوارات", "سماعات", "ساعات", "شواحن"].map((c, i) => (
              <Button key={c} variant={i === 0 ? "default" : "outline"} size="sm">{c}</Button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {PRODUCTS.map((p, i) => (
              <button
                key={i}
                onClick={() => add(p)}
                className="group text-right"
              >
                <Card variant="bento" className="h-full p-4 hover:scale-[1.02] hover:border-primary/40 cursor-pointer">
                  <div className="aspect-square rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800 flex items-center justify-center mb-3 transition-transform group-hover:scale-105">
                    <span className="text-2xl font-bold text-brand-700 dark:text-brand-300">{p.img}</span>
                  </div>
                  <div className="space-y-1">
                    <Badge variant="outline" size="sm">{p.cat}</Badge>
                    <p className="text-sm font-medium leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-base font-bold text-primary tabular-nums">{p.price.toLocaleString()} ج.م</p>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart panel */}
      <aside className="w-[400px] bg-card border-l border-border flex flex-col shrink-0">
        <div className="h-16 border-b border-border flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-5 text-primary" />
            <h2 className="font-semibold">الفاتورة الحالية</h2>
            <Badge variant="subtle" size="sm">#INV-0128</Badge>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setCart([])} disabled={!cart.length}>
            <Trash2 className="size-4" />
          </Button>
        </div>

        {/* Customer */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <div className="size-8 rounded-full bg-primary-subtle flex items-center justify-center"><User className="size-4 text-primary" /></div>
            <div className="flex-1">
              <p className="text-sm font-medium">عميل نقدي</p>
              <p className="text-[10px] text-muted-foreground">اضغط للتغيير</p>
            </div>
            <Button variant="ghost" size="sm">تغيير</Button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-12">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center">
                <ShoppingCart className="size-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">السلة فارغة</p>
                <p className="text-sm text-muted-foreground">اضغط على المنتجات لإضافتها</p>
              </div>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors animate-in">
                <div className="size-12 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900 dark:to-brand-800 flex items-center justify-center text-xs font-bold text-brand-700 dark:text-brand-300 shrink-0">
                  {item.img}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{item.price.toLocaleString()} ج.م</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" onClick={() => dec(item.name)}><Minus className="size-3" /></Button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                  <Button variant="outline" size="icon-sm" onClick={() => inc(item.name)}><Plus className="size-3" /></Button>
                </div>
                <div className="w-20 text-left">
                  <p className="text-sm font-bold tabular-nums">{(item.price * item.qty).toLocaleString()}</p>
                </div>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => remove(item.name)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Totals + Payment */}
        <div className="border-t border-border p-4 space-y-3 bg-card-muted/50">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="font-medium tabular-nums">{subtotal.toLocaleString()} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ضريبة 14%</span>
              <span className="font-medium tabular-nums">{tax.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الخصم</span>
              <span className="font-medium text-success tabular-nums">0 ج.م</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between items-baseline">
              <span className="font-semibold">الإجمالي</span>
              <span className="text-2xl font-bold text-primary tabular-nums">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ج.م</span>
            </div>
          </div>

          {/* Payment methods */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: "cash", label: "كاش", icon: <Banknote /> },
              { id: "vodafone", label: "فودافون", icon: <Smartphone /> },
              { id: "instapay", label: "انستاباي", icon: <CreditCard /> },
              { id: "fawry", label: "فوري", icon: <Wallet /> },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setPayMethod(m.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all [&_svg]:size-4 ${
                  payMethod === m.id
                    ? "border-primary bg-primary-subtle text-primary-subtle-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {m.icon}
                <span className="text-[10px] font-medium">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="gap-2"><Percent className="size-4" /></Button>
            <Button variant="gradient" size="lg" className="flex-1 gap-2 text-base">
              <Banknote className="size-4" />
              إتمام البيع · {total.toLocaleString(undefined, { maximumFractionDigits: 0 })} ج.م
            </Button>
            <Button variant="outline" size="icon" className="gap-2"><Printer className="size-4" /></Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
