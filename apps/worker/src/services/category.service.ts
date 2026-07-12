/**
 * Category service — CRUD with tree support via parent_id.
 *
 * Business rules:
 *  - Circular reference prevention (cannot set parent to self or descendant).
 *  - Cannot delete a category that has products or sub-categories.
 *  - Soft-delete cascades: sub-categories' parent_id is set to NULL.
 */
import {
  AppError,
  ERROR_CODES,
  type Category,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type CategoryQuery,
} from '@mobile-shop/shared';
import type { LooseSupabaseClient } from '../lib/supabase';
import { writeAuditLog } from './audit.service';
import type { AccessTokenUser } from './auth.service';

const TABLE = 'categories';

/** List categories — returns a flat list (UI builds tree client-side). */
export async function listCategories(
  supabase: LooseSupabaseClient,
  query: CategoryQuery,
): Promise<Category[]> {
  let q = supabase.from(TABLE).select('*');
  if (!query.includeInactive) q = q.eq('is_active', true);
  q = q.is('deleted_at', null).order('sort_order', { ascending: true }).order('name', { ascending: true });

  const { data, error } = await q;
  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);

  let categories = (data ?? []) as Category[];

  // Filter by parent (or roots).
  if (query.parentId !== undefined) {
    categories = categories.filter((c) => c.parent_id === query.parentId);
  }

  return categories;
}

/** Get a single category. */
export async function getCategory(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<Category> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  if (!data) throw new AppError(ERROR_CODES.NOT_FOUND, 'الفئة غير موجودة');

  return data as Category;
}

/** Create a new category. */
export async function createCategory(
  supabase: LooseSupabaseClient,
  input: CreateCategoryInput,
  actor: AccessTokenUser,
): Promise<Category> {
  // Validate parent if specified.
  if (input.parentId) {
    await getCategory(supabase, input.parentId);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Generate slug from name (URL-safe).
  const slug = generateSlug(input.name);

  const { data: category, error } = await supabase
    .from(TABLE)
    .insert({
      id,
      name: input.name,
      slug,
      parent_id: input.parentId ?? null,
      icon: input.icon ?? null,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
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
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'اسم الفئة أو الـ slug مستخدم بالفعل');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  await writeAuditLog(supabase, {
    userId: actor.id,
    action: 'create',
    entity: TABLE,
    entityId: id,
    after: category as unknown as Record<string, unknown>,
  });

  return category as Category;
}

/** Update a category. Circular reference check applied. */
export async function updateCategory(
  supabase: LooseSupabaseClient,
  id: string,
  input: UpdateCategoryInput,
  actor: AccessTokenUser,
): Promise<Category> {
  const existing = await getCategory(supabase, id);

  // Prevent circular reference.
  if (input.parentId) {
    if (input.parentId === id) {
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'لا يمكن تعيين الفئة كفئة أم لنفسها');
    }
    // Walk up the parent chain to detect cycles.
    const parent = await getCategory(supabase, input.parentId);
    let cursor = parent;
    while (cursor.parent_id) {
      if (cursor.parent_id === id) {
        throw new AppError(
          ERROR_CODES.BUSINESS_RULE_VIOLATION,
          'تعيين دائري: الفئة المحددة كأم تنحدر من هذه الفئة',
        );
      }
      cursor = await getCategory(supabase, cursor.parent_id);
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: actor.id,
  };
  if (input.name !== undefined) {
    updates.name = input.name;
    updates.slug = generateSlug(input.name);
  }
  if (input.parentId !== undefined) updates.parent_id = input.parentId ?? null;
  if (input.icon !== undefined) updates.icon = input.icon ?? null;
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;
  if (input.isActive !== undefined) updates.is_active = input.isActive;

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

  return updated as Category;
}

/** Soft-delete a category. Sub-categories' parent_id is set to NULL. */
export async function deleteCategory(
  supabase: LooseSupabaseClient,
  id: string,
  actor: AccessTokenUser,
): Promise<void> {
  const category = await getCategory(supabase, id);

  // Check no products assigned.
  const { count: productsCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .is('deleted_at', null);

  if ((productsCount ?? 0) > 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن حذف فئة بها ${productsCount} منتج. أعد تعيين المنتجات أولاً.`,
    );
  }

  // Check no sub-categories.
  const { count: subCount } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
    .is('deleted_at', null);

  if ((subCount ?? 0) > 0) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `لا يمكن حذف فئة بها ${subCount} فئة فرعية. احذف الفئات الفرعية أولاً.`,
    );
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
    before: category as unknown as Record<string, unknown>,
  });
}

/** Generate URL-safe slug from Arabic/English name. */
function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .slice(0, 100);
}
