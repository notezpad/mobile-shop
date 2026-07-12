-- ============================================================================
-- Migration 0004 — Phase 3 (Catalog)
--
-- Contents:
--  1. Seed default categories for mobile shop catalog.
--  2. Add helpful view for products + stock levels.
-- ============================================================================

-- ─── 1. Seed default categories ───────────────────────────────────
-- Tree structure:
--   smartphones
--     ├─ apple
--     ├─ samsung
--     ├─ xiaomi
--     ├─ oppo
--     ├─ realme
--     └─ other
--   tablets
--   accessories
--     ├─ chargers
--     ├─ cables
--     ├─ cases
--     ├─ earphones
--     ├─ screen-protectors
--     ├─ power-banks
--     └─ memory-cards
--   parts (for repairs)
--     ├─ screens
--     ├─ batteries
--     ├─ speakers
--     └─ ports
--   services

do $$
declare
  cat_id text;
  parent_id uuid;
begin
  -- Root categories
  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values (gen_random_uuid(), 'هواتف ذكية', 'smartphones', null, 'smartphone', true, 1)
  returning id into parent_id;

  -- Sub-categories under smartphones
  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values
    (gen_random_uuid(), 'Apple', 'apple', parent_id, 'apple', true, 1),
    (gen_random_uuid(), 'Samsung', 'samsung', parent_id, 'samsung', true, 2),
    (gen_random_uuid(), 'Xiaomi', 'xiaomi', parent_id, 'xiaomi', true, 3),
    (gen_random_uuid(), 'Oppo', 'oppo', parent_id, 'oppo', true, 4),
    (gen_random_uuid(), 'Realme', 'realme', parent_id, 'realme', true, 5),
    (gen_random_uuid(), 'Infinix', 'infinix', parent_id, 'infinix', true, 6),
    (gen_random_uuid(), 'Tecno', 'tecno', parent_id, 'tecno', true, 7),
    (gen_random_uuid(), 'Honor', 'honor', parent_id, 'honor', true, 8),
    (gen_random_uuid(), 'أخرى', 'other-smartphones', parent_id, 'more', true, 99)
  on conflict do nothing;

  -- Tablets
  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values (gen_random_uuid(), 'أجهزة لوحية', 'tablets', null, 'tablet', true, 2)
  on conflict do nothing;

  -- Accessories (root)
  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values (gen_random_uuid(), 'إكسسوارات', 'accessories', null, 'package', true, 3)
  returning id into parent_id;

  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values
    (gen_random_uuid(), 'شواحن', 'chargers', parent_id, 'zap', true, 1),
    (gen_random_uuid(), 'كابلات', 'cables', parent_id, 'cable', true, 2),
    (gen_random_uuid(), 'جرابات', 'cases', parent_id, 'shield', true, 3),
    (gen_random_uuid(), 'سماعات', 'earphones', parent_id, 'headphones', true, 4),
    (gen_random_uuid(), 'واقي شاشة', 'screen-protectors', parent_id, 'monitor', true, 5),
    (gen_random_uuid(), 'باور بانك', 'power-banks', parent_id, 'battery-charging', true, 6),
    (gen_random_uuid(), 'كروت ذاكرة', 'memory-cards', parent_id, 'sd-card', true, 7)
  on conflict do nothing;

  -- Parts (for repairs)
  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values (gen_random_uuid(), 'قطع غيار', 'parts', null, 'wrench', true, 4)
  returning id into parent_id;

  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values
    (gen_random_uuid(), 'شاشات', 'screens', parent_id, 'monitor', true, 1),
    (gen_random_uuid(), 'بطاريات', 'batteries', parent_id, 'battery', true, 2),
    (gen_random_uuid(), 'سماعات', 'speakers', parent_id, 'speaker', true, 3),
    (gen_random_uuid(), 'منافذ شحن', 'ports', parent_id, 'plug', true, 4)
  on conflict do nothing;

  -- Services (root, for service-type products)
  insert into public.categories (id, name, slug, parent_id, icon, is_active, sort_order)
  values (gen_random_uuid(), 'خدمات', 'services', null, 'wrench', true, 5)
  on conflict do nothing;
end $$;

-- ─── 2. View: products with stock + IMEI counts ───────────────────
create or replace view public.v_products_summary as
select
  p.id,
  p.name,
  p.sku,
  p.barcode,
  p.type,
  p.brand,
  p.model,
  p.cost_price,
  p.sale_price,
  p.is_active,
  p.category_id,
  c.name as category_name,
  -- Stock quantities (sum across branches)
  (
    select coalesce(sum(s.quantity - s.reserved_quantity), 0)
    from public.inventory_stocks s
    where s.product_id = p.id and s.deleted_at is null
  ) as available_stock,
  (
    select count(*)
    from public.device_units du
    where du.product_id = p.id and du.status = 'in_stock' and du.deleted_at is null
  ) as in_stock_devices_count
from public.products p
left join public.categories c on c.id = p.category_id
where p.deleted_at is null;

comment on view public.v_products_summary is
  'Product summary with aggregated stock quantities and device counts across all branches.';
