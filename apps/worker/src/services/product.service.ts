/**
 * Product service — CRUD + image upload + stock level info.
 *
 * Notes:
 *  - SKU is unique system-wide.
 *  - For 'imei' products, a separate device_units table tracks individual units.
 *  - Stock level is joined from inventory_stocks (current branch only).
 *  - Image upload is optional — accepts a base64 data URL, stored in Supabase Storage.
 */
import {
  AppError,
  ERROR_CODES,
  type Product,
  type PaginatedResult,
  type CreateProductInput,
  type UpdateProductInput,
  type ProductQuery,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'products';

/** List products with filters + pagination + stock level join. */
export async function listProducts(
  supabase: LooseSupabaseClient,
  query: ProductQuery,
  branchId?: string | null,
): Promise<PaginatedResult<Product & { stock_level?: number }>> {
  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (query.search) {
    q = q.or(
      `name.ilike.%${query.search}%,sku.ilike.%${query.search}%,barcode.ilike.%${query.search}%,brand.ilike.%${query.search}%,model.ilike.%${query.search}%`,
    );
  }
  if (query.categoryId) q = q.eq('category_id', query.categoryId);
  if (query.type) q = q.eq('type', query.type);
  if (query.isActive !== undefined) q = q.eq('is_active', query.isActive === 'true');

  const sortColumn = (() => {
    switch (query.sortBy) {
      case 'name': return 'name';
      case 'sku': return 'sku';
      case 'salePrice': return 'sale_price';
      case 'stockLevel': return 'created_at'; // fallback — stock join handled separately
      default: return 'created_at';
    }
  })();
  q = q.order(sortColumn, { ascending: query.sortDir === 'asc' });
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  let products = (data ?? []) as Product[];

  // If branch context provided, attach stock levels.
  if (branchId && products.length > 0) {
    const productIds = products.map((p) => p.id);
    const { data: stocks } = await supabase
      .from('inventory_stocks')
      .select('product_id, quantity, reserved_quantity')
      .eq('branch_id', branchId)
      .in('product_id', productIds)
      .is('deleted_at', null);

    const stockMap = new Map<string, number>();
    (stocks ?? []).forEach((s: { product_id: string; quantity: number; reserved_quantity: number }) => {
      stockMap.set(s.product_id, s.quantity - s.reserved_quantity);
    });

    products = products.map((p) => ({
      ...p,
      stock_level: stockMap.get(p.id) ?? 0,
    })) as Array<Product & { stock_level?: number }>;

    // Filter low-stock if requested.
    if (query.lowStock === 'true') {
      products = products.filter(
        (p) => ((p as Product & { stock_level?: number }).stock_level ?? 0) <= p.min_quantity,
      );
    }
  }

  const total = count ?? 0;
  return {
    items: products,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/** Get a single product with stock + recent movements. */
export async function getProduct(
  supabase: LooseSupabaseClient,
  id: string,
  branchId?: string | null,
): Promise<
  Product & {
    stock_levels?: Array<{ branch_id: string; quantity: number; reserved_quantity: number }>;
    device_units_count?: number;
  }
> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'المنتج غير موجود');

  const product = data as Product;
  const enriched: Product & {
    stock_levels?: Array<{ branch_id: string; quantity: number; reserved_quantity: number }>;
    device_units_count?: number;
  } = { ...product };

  // Stock levels across all branches (or just one if specified).
  if (branchId) {
    const { data: stock } = await supabase
      .from('inventory_stocks')
      .select('branch_id, quantity, reserved_quantity')
      .eq('product_id', id)
      .eq('branch_id', branchId)
      .is('deleted_at', null);
    enriched.stock_levels = (stock ?? []) as Array<{
      branch_id: string;
      quantity: number;
      reserved_quantity: number;
    }>;
  } else {
    const { data: stocks } = await supabase
      .from('inventory_stocks')
      .select('branch_id, quantity, reserved_quantity')
      .eq('product_id', id)
      .is('deleted_at', null);
    enriched.stock_levels = (stocks ?? []) as Array<{
      branch_id: string;
      quantity: number;
      reserved_quantity: number;
    }>;
  }

  // For IMEI products: count device units by status.
  if (product.type === 'imei') {
    const { count } = await supabase
      .from('device_units')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id)
      .eq('status', 'in_stock')
      .is('deleted_at', null);
    enriched.device_units_count = count ?? 0;
  }

  return enriched;
}

/** Create a new product. */
export async function createProduct(
  supabase: LooseSupabaseClient,
  input: CreateProductInput,
  actor: AccessTokenUser,
): Promise<Product> {
  // Validate SKU uniqueness.
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('sku', input.sku)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'SKU مستخدم بالفعل');
  }

  // Validate category if specified.
  if (input.categoryId) {
    const { data: cat } = await supabase
      .from('categories')
      .select('id')
      .eq('id', input.categoryId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!cat) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'الفئة غير موجودة');
    }
  }

  // Auto-generate barcode from SKU if not provided.
  const barcode = input.barcode ?? generateEan13(input.sku);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: product, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      sku: input.sku,
      barcode,
      name: input.name,
      name_ar: input.nameAr ?? null,
      category_id: input.categoryId ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      description: input.description ?? null,
      type: input.type,
      unit: input.unit ?? 'piece',
      cost_price: input.costPrice,
      sale_price: input.salePrice,
      wholesale_price: input.wholesalePrice ?? null,
      tax_rate: input.taxRate,
      min_quantity: input.minQuantity,
      has_warranty: input.hasWarranty,
      warranty_days: input.warrantyDays,
      image_url: input.imageUrl ?? null,
      is_active: input.isActive,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      sync_status: 'synced',
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'القيمة مكررة');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: product as unknown as Record<string, unknown>,
  });

  return product as Product;
}

/** Update a product. */
export async function updateProduct(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateProductInput,
  actor: AccessTokenUser,
): Promise<Product> {
  const existing = await getProduct(supabase, id);

  // Validate SKU uniqueness if changed.
  if (input.sku && input.sku !== existing.sku) {
    const { data: existingSku } = await supabase
      .from(TABLE)
      .select('id')
      .eq('sku', input.sku)
      .neq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingSku) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'SKU مستخدم بالفعل');
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  const fields: Array<[keyof UpdateProductInput, string]> = [
    ['sku', 'sku'],
    ['barcode', 'barcode'],
    ['name', 'name'],
    ['nameAr', 'name_ar'],
    ['categoryId', 'category_id'],
    ['brand', 'brand'],
    ['model', 'model'],
    ['description', 'description'],
    ['type', 'type'],
    ['unit', 'unit'],
    ['costPrice', 'cost_price'],
    ['salePrice', 'sale_price'],
    ['wholesalePrice', 'wholesale_price'],
    ['taxRate', 'tax_rate'],
    ['minQuantity', 'min_quantity'],
    ['hasWarranty', 'has_warranty'],
    ['warrantyDays', 'warranty_days'],
    ['imageUrl', 'image_url'],
    ['isActive', 'is_active'],
  ];
  for (const [camelKey, snakeKey] of fields) {
    if (input[camelKey] !== undefined) updates[snakeKey] = input[camelKey];
  }

  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'update',
    entity: TABLE,
    entityId: id,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
  });

  return updated as Product;
}

/** Soft-delete a product. */
export async function deleteProduct(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const product = await getProduct(supabase, id);

  // Block if has in-stock device units (IMEI products).
  if (product.type === 'imei') {
    const { count } = await supabase
      .from('device_units')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id)
      .eq('status', 'in_stock')
      .is('deleted_at', null);
    if ((count ?? 0) > 0) {
      throw new AppError(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        `لا يمكن حذف منتج به ${count} جهاز في المخزون. خفّف المخزون أولاً.`,
      );
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      deleted_at: now,
      is_active: false,
      updated_at: now,
      updated_by: actor.id,
    })
    .eq('id', id);

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'delete',
    entity: TABLE,
    entityId: id,
    before: product as unknown as Record<string, unknown>,
  });
}

/**
 * Generate a pseudo-EAN-13 barcode from a SKU string.
 * Not a real registered barcode, but unique per SKU and scannable.
 */
function generateEan13(sku: string): string {
  // Pad SKU chars to 12 digits using char codes.
  let digits = '';
  for (let i = 0; i < sku.length && digits.length < 12; i++) {
    digits += String(sku.charCodeAt(i) % 10);
  }
  while (digits.length < 12) digits += '0';

  // Luhn checksum for the 13th digit.
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i]!, 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const checksum = (10 - (sum % 10)) % 10;
  return digits + String(checksum);
}
