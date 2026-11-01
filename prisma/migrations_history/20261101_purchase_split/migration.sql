-- 🏬 الشراء الموزّع على فروع: كل فرع بياخد أمر شراء خاص بيه، والأوامر المتقسمة من فاتورة
-- واحدة بتتربط ببعض بمعرّف مجموعة (idempotent).
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "splitGroupId" TEXT;
CREATE INDEX IF NOT EXISTS "PurchaseOrder_splitGroupId_idx" ON "PurchaseOrder"("splitGroupId");
