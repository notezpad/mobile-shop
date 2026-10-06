import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },

  // ⚡ v10 (سرعة workeros): كاش الراوتر في العميل (staleTimes)
  // ─────────────────────────────────────────────────────────────
  // افتراضياً Next.js بيعتبر الـ RSC payload بتاع الصفحات الديناميكية
  // "قديم فوراً" (staleTime = 0) — فكل تنقلة بين صفحات التطبيق بتبعت
  // طلب للـ Worker على Cloudflare (استدعاء كامل + زمن استجابة) حتى
  // لو الصفحة نفسها داتا بتاعتها بتتحمل client-side أصلاً.
  //
  // بـ dynamic: 30 — أي تنقلة لصفحة اتفتحت خلال آخر 30 ثانية بترندر
  // من كاش الراوتر في الميموري **بدون أي طلب للسيرفر خالص** (نفس إحساس
  // الـ SPA عند workeros)، والـ View بيرسم داتاه فوراً من كاش SWR
  // (api-offline.ts). static: 300 للصفحات الثابتة.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },

  // FIX (Cloudflare/OpenNext build): OpenNext's file tracer runs in Node and
  // resolves `pg-cloudflare` through the `default` export condition, which is
  // an EMPTY stub ("./dist/empty.js"). Later, the workerd-conditioned esbuild
  // pass needs "./dist/index.js" (the real CloudflareSocket) which was never
  // copied into .open-next/server-functions/default/node_modules → build error:
  //   ERROR: Could not resolve "pg-cloudflare"
  // Forcing these paths into the output trace makes the real files get copied.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pg-cloudflare/dist/**", "./node_modules/pg-cloudflare/package.json"],
  },
};

export default nextConfig;
