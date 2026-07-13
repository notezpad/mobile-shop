-- ============================================================================
-- SEED.sql — بيانات تجريبية لنظام Mobile Shop ERP (SaaS)
--
-- التشغيل: supabase db reset (يطبّق migrations + seed.sql)
-- أو: psql -f supabase/seed/seed.sql
--
-- بعد التشغيل يمكنك تسجيل الدخول بـ:
--   Username: super_admin  |  Password: Admin@123
--   أو: admin  |  Admin@123
-- ============================================================================

-- ─── 1. إنشاء Tenant تجريبي ──────────────────────────────────────
-- نستخدم UUID ثابت ليسهل الرجوع إليه في باقي السكربت.
INSERT INTO public.tenants (id, name, slug, status, settings)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'موبايل ستور التجريبي',
  'demo-shop',
  'active',
  '{"timezone": "Africa/Cairo"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. إنشاء فرع رئيسي للـ Tenant ────────────────────────────────
INSERT INTO public.branches (
  id, name, code, is_main, is_active, settings, tenant_id,
  created_at, updated_at, deleted_at, revision, sync_status
)
VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'الفرع الرئيسي',
  'MAIN',
  true,
  true,
  '{"taxRate": 14, "currency": "EGP", "receiptHeader": "مرحباً بكم", "receiptFooter": "شكراً لزيارتكم", "lowStockThreshold": 5, "enableVatInvoice": true, "vatNumber": "312-123-456", "printerType": "a4", "printerName": null}'::jsonb,
  'a0000000-0000-4000-8000-000000000001',
  now(), now(), null, 1, 'synced'
)
ON CONFLICT DO NOTHING;

-- ─── 3. ربط المستخدم super_admin بالـ Tenant ──────────────────────
UPDATE public.users
SET tenant_id = 'a0000000-0000-4000-8000-000000000001',
    branch_id = 'b0000000-0000-4000-8000-000000000001'
WHERE username = 'super_admin' AND tenant_id IS NULL;

-- ─── 4. إنشاء مستخدم admin تجريبي ────────────────────────────────
-- Password: Admin@123
INSERT INTO public.users (
  id, username, password_hash, full_name, email, role_id, branch_id, status,
  preferences, tenant_id, created_at, updated_at, deleted_at, revision, sync_status
)
SELECT
  gen_random_uuid(),
  'admin',
  'pbkdf2$100000$ewyV6aIax7BXZnWgT4IqzQ==$GADJoM5PFtJfpRCIZbVzXnTmV6KV7Z8VT55Qr7Lf0d8=',
  'مدير المتجر',
  'admin@mobileshop.local',
  (SELECT id FROM public.roles WHERE key = 'admin' LIMIT 1),
  'b0000000-0000-4000-8000-000000000001',
  'active',
  '{"theme":"system","language":"ar","sidebarCollapsed":false}'::jsonb,
  'a0000000-0000-4000-8000-000000000001',
  now(), now(), null, 1, 'synced'
WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE username = 'admin');

-- ─── 5. إنشاء tenant_member للمستخدمين ────────────────────────────
INSERT INTO public.tenant_members (id, tenant_id, user_id, role_key, is_default, joined_at, created_at, updated_at, deleted_at, revision, sync_status)
SELECT gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', u.id, 'admin', true, now(), now(), now(), null, 1, 'synced'
FROM public.users u
WHERE u.username IN ('super_admin', 'admin')
  AND u.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = u.id AND tm.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  );

-- ─── 6. إنشاء فئات للـ Tenant ─────────────────────────────────────
INSERT INTO public.categories (id, name, slug, parent_id, icon, is_active, sort_order, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT gen_random_uuid(), c.name, c.slug, NULL, c.icon, true, c.sort_order,
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
FROM (VALUES
  ('هواتف ذكية', 'smartphones', 'smartphone', 1),
  ('Apple', 'apple', 'apple', 2),
  ('Samsung', 'samsung', 'samsung', 3),
  ('إكسسوارات', 'accessories', 'package', 4),
  ('شواحن', 'chargers', 'zap', 5),
  ('جرابات', 'cases', 'shield', 6),
  ('قطع غيار', 'parts', 'wrench', 7),
  ('شاشات', 'screens', 'monitor', 8),
  ('بطاريات', 'batteries', 'battery', 9),
  ('خدمات', 'services', 'wrench', 10)
) AS c(name, slug, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = c.slug AND tenant_id = 'a0000000-0000-4000-8000-000000000001');

-- ─── 7. إنشاء منتجات تجريبية ─────────────────────────────────────
INSERT INTO public.products (id, sku, barcode, name, category_id, brand, model, type, unit, cost_price, sale_price, tax_rate, min_quantity, is_active, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT
  gen_random_uuid(),
  p.sku, p.barcode, p.name,
  (SELECT id FROM public.categories WHERE slug = p.cat_slug AND tenant_id = 'a0000000-0000-4000-8000-000000000001' LIMIT 1),
  p.brand, p.model, p.type, 'piece', p.cost, p.sale, 14, 5, true,
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
FROM (VALUES
  ('IP15-PM-256', '6190123456789', 'iPhone 15 Pro Max 256GB', 'apple', 'Apple', 'A2849', 'imei', 58000, 65000),
  ('SAM-A54-128', '6190234567890', 'Samsung Galaxy A54 128GB', 'samsung', 'Samsung', 'SM-A546', 'imei', 12000, 14500),
  ('SHA-20W', '6190345678901', 'شاحن سامسونج 20W', 'chargers', 'Samsung', 'EP-TA200', 'standard', 150, 300),
  ('CASE-IP15', '6190456789012', 'جراب آيفون 15 برو', 'cases', 'Spigen', 'CS-IP15P', 'standard', 80, 250),
  ('BAT-IP13', '6190567890123', 'بطارية آيفون 13', 'batteries', 'Generic', 'BAT-IP13', 'standard', 200, 500),
  ('SCR-IP14', '6190678901234', 'شاشة آيفون 14', 'screens', 'Generic', 'SCR-IP14', 'standard', 1500, 3000),
  ('INST-FEE', '6190789012345', 'رسوم تركيب', 'services', NULL, NULL, 'service', 0, 100)
) AS p(sku, barcode, name, cat_slug, brand, model, type, cost, sale)
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE sku = p.sku AND tenant_id = 'a0000000-0000-4000-8000-000000000001');

-- ─── 8. إنشاء مخزون للمنتجات ──────────────────────────────────────
INSERT INTO public.inventory_stocks (id, product_id, branch_id, quantity, reserved_quantity, min_quantity, max_quantity, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT
  gen_random_uuid(), p.id, 'b0000000-0000-4000-8000-000000000001',
  CASE WHEN p.type = 'imei' THEN 0 ELSE 50 END, 0, 5, 200,
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
FROM public.products p
WHERE p.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_stocks s
    WHERE s.product_id = p.id AND s.branch_id = 'b0000000-0000-4000-8000-000000000001'
  );

-- ─── 9. إنشاء أجهزة IMEI تجريبية ─────────────────────────────────
INSERT INTO public.device_units (id, product_id, imei1, branch_id, status, cost, sale_price, received_at, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT
  gen_random_uuid(), p.id, d.imei, 'b0000000-0000-4000-8000-000000000001',
  'in_stock', p.cost_price, p.sale_price, now(),
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
FROM public.products p
CROSS JOIN (VALUES
  ('490154203237518'),
  ('490154203237525'),
  ('490154203237532')
) AS d(imei)
WHERE p.sku = 'IP15-PM-256'
  AND p.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.device_units du WHERE du.imei1 = d.imei
  );

INSERT INTO public.device_units (id, product_id, imei1, branch_id, status, cost, sale_price, received_at, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT
  gen_random_uuid(), p.id, d.imei, 'b0000000-0000-4000-8000-000000000001',
  'in_stock', p.cost_price, p.sale_price, now(),
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
FROM public.products p
CROSS JOIN (VALUES
  ('490154203237549'),
  ('490154203237556')
) AS d(imei)
WHERE p.sku = 'SAM-A54-128'
  AND p.tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM public.device_units du WHERE du.imei1 = d.imei
  );

-- ─── 10. إنشاء عملاء تجريبيين ────────────────────────────────────
INSERT INTO public.customers (id, name, code, phone, email, balance, credit_limit, is_active, total_purchases, total_repairs, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT
  gen_random_uuid(), c.name, c.code, c.phone, c.email, 0, 1000, true, 0, 0,
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
FROM (VALUES
  ('أحمد محمد', 'C-00001', '01012345678', 'ahmed@example.com'),
  ('محمود علي', 'C-00002', '01098765432', NULL),
  ('سارة حسن', 'C-00003', '01155667788', 'sara@example.com')
) AS c(name, code, phone, email)
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE code = c.code AND tenant_id = 'a0000000-0000-4000-8000-000000000001');

-- ─── 11. إنشاء مورد تجريبي ────────────────────────────────────────
INSERT INTO public.suppliers (id, name, code, phone, is_active, balance, tenant_id, created_at, updated_at, deleted_at, revision, sync_status)
SELECT gen_random_uuid(), 'شركة الإتصالات الحديثة', 'SUP-001', '0223456789', true, 0,
  'a0000000-0000-4000-8000-000000000001', now(), now(), null, 1, 'synced'
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE code = 'SUP-001' AND tenant_id = 'a0000000-0000-4000-8000-000000000001');

-- ─── 12. إعداد السكربت يعمل ───────────────────────────────────────
-- ملاحظة: العميل super_admin يُنشأ في migration 0002.
-- هذا السكربت يربطه بالـ tenant + branch.
