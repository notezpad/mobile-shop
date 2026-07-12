/**
 * Catalog hooks — cached list selectors for categories + products.
 */
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, productsApi } from '../api/catalog.api';
import type { Category, Product, ProductQuery } from '@mobile-shop/shared';
import { useMemo } from 'react';

/** Cached flat list of all active categories. */
export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: ['categories', { includeInactive }],
    queryFn: () => categoriesApi.list({ includeInactive }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Build a tree from the flat category list. */
export function useCategoryTree(includeInactive = false) {
  const { data: categories = [], ...rest } = useCategories(includeInactive);

  const tree = useMemo(() => buildTree(categories), [categories]);
  return { tree, categories, ...rest };
}

function buildTree(items: Category[]): Array<Category & { children?: Category[] }> {
  const map = new Map<string, Category & { children?: Category[] }>();
  items.forEach((item) => map.set(item.id, { ...item, children: [] }));
  const roots: Array<Category & { children?: Category[] }> = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id)!;
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/** Find a category by ID. */
export function useCategory(id?: string | null) {
  const { data: categories = [] } = useCategories();
  if (!id) return undefined;
  return categories.find((c) => c.id === id);
}

/** Get the full path (root → leaf) for a category. */
export function useCategoryPath(id?: string | null): Category[] {
  const { data: categories = [] } = useCategories();
  if (!id) return [];
  const path: Category[] = [];
  let cursor = categories.find((c) => c.id === id);
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parent_id ? categories.find((c) => c.id === cursor!.parent_id) : undefined;
  }
  return path;
}

/** Cached product search — debounced via React Query's built-in dedup. */
export function useProducts(query: ProductQuery) {
  return useQuery({
    queryKey: ['products', query],
    queryFn: () => productsApi.list(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

/** Single product (with stock levels + device units count). */
export function useProduct(id?: string | null) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });
}

/** Quick search by SKU/barcode — used in POS. */
export function useProductSearch(search: string) {
  return useQuery({
    queryKey: ['products', 'search', search],
    queryFn: () =>
      productsApi.list({
        page: 1,
        pageSize: 10,
        search,
        sortBy: 'name',
        sortDir: 'asc',
      }),
    enabled: search.trim().length >= 2,
    staleTime: 10_000,
  });
}
