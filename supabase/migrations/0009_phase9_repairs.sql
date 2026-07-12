-- ============================================================================
-- Migration 0009 — Phase 9 (Repairs)
--
-- Contents:
--  1. v_repairs_list view — repairs with customer + technician + branch names.
--  2. v_repairs_with_details view — repair + history + parts as JSON.
--  3. Indexes for faster repair queries.
-- ============================================================================

-- ─── 1. v_repairs_list view ───────────────────────────────────────
create or replace view public.v_repairs_list as
select
  r.id,
  r.ticket_no,
  r.branch_id,
  r.customer_id,
  r.technician_id,
  r.received_by,
  r.device_brand,
  r.device_model,
  r.device_imei,
  r.problem_description,
  r.status,
  r.received_at,
  r.estimated_delivery_at,
  r.started_at,
  r.completed_at,
  r.delivered_at,
  r.labor_cost,
  r.parts_cost,
  r.discount,
  r.total,
  r.paid,
  r.due_amount,
  r.warranty_days,
  r.parent_repair_id,
  r.notes,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  c.name as customer_name,
  c.phone as customer_phone,
  t.full_name as technician_name,
  rb.full_name as received_by_name,
  b.name as branch_name,
  b.code as branch_code
from public.repairs r
left join public.customers c on c.id = r.customer_id and c.deleted_at is null
left join public.users t on t.id = r.technician_id and t.deleted_at is null
left join public.users rb on rb.id = r.received_by and rb.deleted_at is null
left join public.branches b on b.id = r.branch_id and b.deleted_at is null
where r.deleted_at is null;

comment on view public.v_repairs_list is
  'Repairs list with customer, technician, received_by, and branch names.';

grant select on public.v_repairs_list to anon, authenticated;

-- ─── 2. v_repairs_with_details view ───────────────────────────────
create or replace view public.v_repairs_with_details as
select
  r.id,
  r.ticket_no,
  r.branch_id,
  r.customer_id,
  r.technician_id,
  r.received_by,
  r.device_brand,
  r.device_model,
  r.device_imei,
  r.device_password,
  r.problem_description,
  r.customer_notes,
  r.accessories,
  r.inspection_photos,
  r.status,
  r.received_at,
  r.estimated_delivery_at,
  r.started_at,
  r.completed_at,
  r.delivered_at,
  r.labor_cost,
  r.parts_cost,
  r.discount,
  r.total,
  r.paid,
  r.due_amount,
  r.warranty_days,
  r.parent_repair_id,
  r.notes,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  c.name as customer_name,
  c.phone as customer_phone,
  t.full_name as technician_name,
  rb.full_name as received_by_name,
  b.name as branch_name,
  b.code as branch_code,
  -- History as JSON array
  (
    select coalesce(json_agg(json_build_object(
      'id', h.id,
      'from_status', h.from_status,
      'to_status', h.to_status,
      'note', h.note,
      'user_id', h.user_id,
      'user_name', u.full_name,
      'created_at', h.created_at
    ) order by h.created_at), '[]'::json)
    from public.repair_status_history h
    left join public.users u on u.id = h.user_id
    where h.repair_id = r.id and h.deleted_at is null
  ) as history,
  -- Parts as JSON array
  (
    select coalesce(json_agg(json_build_object(
      'id', rp.id,
      'repair_id', rp.repair_id,
      'product_id', rp.product_id,
      'quantity', rp.quantity,
      'unit_price', rp.unit_price,
      'total', rp.total,
      'stock_movement_id', rp.stock_movement_id,
      'product_name', p.name,
      'product_sku', p.sku
    )), '[]'::json)
    from public.repair_parts rp
    left join public.products p on p.id = rp.product_id
    where rp.repair_id = r.id and rp.deleted_at is null
  ) as parts
from public.repairs r
left join public.customers c on c.id = r.customer_id and c.deleted_at is null
left join public.users t on t.id = r.technician_id and t.deleted_at is null
left join public.users rb on rb.id = r.received_by and rb.deleted_at is null
left join public.branches b on b.id = r.branch_id and b.deleted_at is null
where r.deleted_at is null;

comment on view public.v_repairs_with_details is
  'Single repair with history + parts as JSON arrays + joined names.';

grant select on public.v_repairs_with_details to anon, authenticated;

-- ─── 3. Indexes ───────────────────────────────────────────────────
create index if not exists idx_repairs_ticket_no
  on public.repairs (ticket_no)
  where deleted_at is null;

create index if not exists idx_repairs_status
  on public.repairs (status, created_at desc)
  where deleted_at is null;

create index if not exists idx_repairs_branch_status
  on public.repairs (branch_id, status, created_at desc)
  where deleted_at is null;

create index if not exists idx_repairs_device_imei
  on public.repairs (device_imei)
  where deleted_at is null and device_imei is not null;

create index if not exists idx_repair_history_repair
  on public.repair_status_history (repair_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_repair_parts_repair
  on public.repair_parts (repair_id)
  where deleted_at is null;
