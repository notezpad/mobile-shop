#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 🛡️ المرحلة 4 (2026-11-02) — سكريبت التنظيف قبل فك ضغط الملفات المصلحة
# شغّله من جذر المشروع:  bash phase4-cleanup.sh
# ═══════════════════════════════════════════════════════════════════════
set -e

# 1) ص-19: الملفات الشاردة (مفيش أي استدعاء ليهم)
rm -f src/app/api/dashboard/dashboard.patch
rm -f prisma/sql/migration-stray-20261030-dynamic-pricing-reset.sql

# 2) خ-8: هيكل migrations القديم (نسخ متضاربة + ملف شارد خارج مجلد) —
#    الأرشيف في prisma/migrations_history/ جاي مع الحزمة، والهيكل الجديد
#    (baseline + phase3 + phase4) جاي في prisma/migrations/
rm -rf prisma/migrations

echo "✅ التنظيف خلص — فك ضغط sholel-phase4-fixed-files.zip فوق جذر المشروع دلوقتي"
echo "   وبعدها: npx prisma generate"
echo "   وعلى الإنتاج: prisma/sql/perf-indexes-concurrently.sql ثم npx prisma migrate deploy"
echo "   (التفاصيل كاملة في الملفات-المصلحة-المرحلة-4-README.md)"
