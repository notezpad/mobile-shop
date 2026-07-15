import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "نظام المحل - منصة إدارة المحلات #1 في مصر",
  description:
    "نظام متكامل لإدارة محلات الموبايل والإكسسوارات - نقطة بيع، مخزون، عملاء، صيانة، تقارير مالية. تجربة مجانية 14 يوم.",
  keywords: [
    "إدارة المحلات",
    "نقطة بيع",
    "POS",
    "محل موبايل",
    "إدارة المخزون",
    "السوق المصري",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} font-cairo antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
