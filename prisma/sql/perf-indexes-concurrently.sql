-- ═══════════════════════════════════════════════════════════════════════════
-- ⚡ مت-14 (2026-11-02) — الفهارس المفقودة بـ CONCURRENTLY (بدون قفل الجداول)
-- ─────────────────────────────────────────────────────────────────────────────
-- دي نفس الفهارس اللي في migration المرحلة 4 لكن بـ CREATE INDEX CONCURRENTLY
-- — آمنة للتشغيل على الإنتاج والخدمة شغالة (Postgres بيبنيلها من غير ما
-- يقفل الجدول). migration الـ Prisma بيشغّل النسخ العادية جوه transaction —
-- اللي هنا أسرع على جداول كبيرة ومش بياخد WRITE LOCK.
--
-- الترتيب الموصى به على الإنتاج (Supabase):
--   1) psql "$DIRECT_URL" -f prisma/sql/perf-indexes-concurrently.sql   ← الأول
--   2) npx prisma migrate deploy                                        ← بعدها
-- الـ IF NOT EXISTS بيخلي الاثنين آمنين للتكرار والتقابل.
-- ═══════════════════════════════════════════════════════════════════════════

-- آجلة الفواتير (الداشبورد بيسأل tenantId + dueDate كل تحميل)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_tenantId_dueDate_idx"
  ON "Sale" ("tenantId", "dueDate");

-- تقارير الفرع بفلتر تاريخ (tenantId + branchId + createdAt)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_tenantId_branchId_createdAt_idx"
  ON "Sale" ("tenantId", "branchId", "createdAt");

-- جرس الإشعارات (بيقرأ tenantId + isRead + createdAt كل 3 دقائق لكل مستخدم)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_tenantId_isRead_createdAt_idx"
  ON "Notification" ("tenantId", "isRead", "createdAt" DESC);

-- عمود tenantId المُلوَّحن في جدول التفاصيل (مت-15)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SaleItem_tenantId_idx"
  ON "SaleItem" ("tenantId");
