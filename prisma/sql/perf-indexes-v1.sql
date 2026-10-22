-- ⚡ 2026-10-22 — فهارس لمسارات المواسم والاستيراد
-- Idempotent — آمن لإعادة التشغيل.
--
-- 1) فلتر/إحصايات/إغلاق/فتح الموسم كلها بتفلتر بـ (tenantId + season).
--    من غير الفهرس ده كل طلب بيمشي على كل منتجات المحل (فهرس tenantId لوحده).
--    (نفس الاسم اللي Prisma هيولّده لو ضفت @@index([tenantId, season]) في schema.prisma)
CREATE INDEX IF NOT EXISTS "Product_tenantId_season_idx" ON "Product" ("tenantId", "season");

-- 2) مطابقة الاستيراد بالاسم: lower(btrim("name")) IN (...) — من غير فهرس تعبير
--    كل صف بيتقارن بكل منتجات المحل. (Prisma مش بيعبّر عن expression index —
--    زي فهرس الباركود، بيتعمل بـ SQL مباشر.)
CREATE INDEX IF NOT EXISTS "Product_tenantId_lname_idx" ON "Product" ("tenantId", (lower(btrim("name"))));
