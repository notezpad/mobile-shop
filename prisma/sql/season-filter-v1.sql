-- 👕 2026-10-22 — الفلتر الذكي للمواسم (باقات الملابس فقط)
-- حالة «المواسم المقفولة» على مستوى المحل — JSON array (نفس أسلوب enabledModules/capabilities)
-- ['SUMMER'] = الصيف مقفول في المخزن الداخلي. بيتحدث فقط من معالج المواسم
-- (POST /api/products/seasonal close/open) ويقرأه فلتر view=active في GET /api/products.
-- Idempotent — آمن لإعادة التشغيل.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "closedSeasons" text NOT NULL DEFAULT '[]';
