"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";

/**
 * هيكل صفحات المصادقة الخفيفة (نسيت كلمة المرور / تعيين كلمة مرور جديدة).
 * نفس شكل «التذكرة» بتاع صفحة الدخول: ترويسة متدرجة + حد منقّط + خروم جانبية.
 */
export default function AuthShell({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[#f7fbf9] px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm"
      >
        <div className="relative space-y-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/5 sm:space-y-5 sm:p-6">
          <header className="relative -mx-4 -mt-4 border-b-2 border-dashed border-[#00c98b]/35 bg-gradient-to-b from-[#e3f9f0] via-[#f1fcf8] to-card px-4 pb-5 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pb-6 sm:pt-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(rgba(0,148,106,.26) 1px, transparent 1.4px)",
                backgroundSize: "14px 14px",
                WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 0% 0%, #000, transparent 75%)",
                maskImage: "radial-gradient(ellipse 60% 70% at 0% 0%, #000, transparent 75%)",
              }}
            />
            <span aria-hidden className="absolute -bottom-2.5 -left-2.5 size-5 rounded-full border border-border bg-[#f7fbf9]" />
            <span aria-hidden className="absolute -bottom-2.5 -right-2.5 size-5 rounded-full border border-border bg-[#f7fbf9]" />

            <div className="relative space-y-4">
              <Link href="/" className="group inline-flex items-center gap-3" aria-label="Nezam POS">
                <img
                  src="/logo.svg" alt="" width={40} height={40}
                  className="size-10 rounded-[14px] shadow-lg shadow-[#00c98b]/35 ring-2 ring-white transition-transform group-hover:-rotate-3 group-hover:scale-105"
                />
                <div className="leading-none">
                  <p dir="ltr" className="text-right text-[18px] font-black tracking-tight text-foreground">
                    Nezam <span className="text-[#00946a]">POS</span>
                  </p>
                  <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">نظام المحل — مبيعات ومخزون وحسابات</p>
                </div>
              </Link>

              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#19e0a2] to-[#00c98b] text-white shadow-md shadow-[#00c98b]/30">
                  {icon}
                </span>
                <div className="min-w-0">
                  <h1 className="text-xl font-extrabold leading-tight tracking-tight text-foreground sm:text-2xl">{title}</h1>
                  {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-balance">{subtitle}</p>}
                </div>
              </div>
            </div>
          </header>

          {children}
        </div>
      </motion.div>
    </main>
  );
}
