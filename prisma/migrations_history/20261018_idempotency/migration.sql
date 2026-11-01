-- Migration 2026-10-18: مفاتيح منع التكرار (Idempotency) للعمليات المالية والمخزنية.
--
-- المشكلة: لو الطلب اتنفذ على السيرفر والرد ضاع (انقطاع نت بعد الـ commit)، الواجهة كانت
-- بتحط العملية في طابور الأوفلاين وتبعتها تاني فتتنفذ مرتين (دفعة عميل/مورد، أمر شراء،
-- مصروف، حركة مخزون...). دلوقتي كل عملية بتتبعت بـ Idempotency-Key واحد من أول محاولة،
-- والسيرفر بيرجّع الرد الأصلي لو شاف نفس المفتاح تاني بدل ما ينفّذ مرة تانية.
--
-- Idempotent — آمن لو اتشغل أكتر من مرة.
CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id"          BIGSERIAL PRIMARY KEY,
  "tenantId"    TEXT      NOT NULL,
  "key"         TEXT      NOT NULL,
  "method"      TEXT      NOT NULL,
  "path"        TEXT      NOT NULL,
  -- NULL = لسه بتتنفذ، وإلا كود الرد الأصلي ونصه
  "status"      INTEGER,
  "body"        TEXT,
  "contentType" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_tenant_key_key" ON "IdempotencyKey" ("tenantId", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyKey_createdAt_idx" ON "IdempotencyKey" ("createdAt");
