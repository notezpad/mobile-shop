/**
 * Catalog API client — categories, products, devices.
 */
import { api } from '@core/db/api-client';
import type {
  Category,
  Product,
  DeviceUnit,
  PaginatedResult,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryQuery,
  CreateProductInput,
  UpdateProductInput,
  ProductQuery,
  CreateDeviceUnitInput,
  BatchCreateDeviceUnitsInput,
  UpdateDeviceUnitInput,
  DeviceUnitQuery,
  BatchImportResult,
} from '@mobile-shop/shared';

export const categoriesApi = {
  list(query: CategoryQuery = { includeInactive: false }): Promise<Category[]> {
    const params = new URLSearchParams();
    if (query.parentId !== undefined) params.set('parentId', query.parentId);
    if (query.includeInactive) params.set('includeInactive', 'true');
    return api.get<Category[]>(`/categories?${params.toString()}`);
  },
  get(id: string): Promise<Category> {
    return api.get<Category>(`/categories/${id}`);
  },
  create(input: CreateCategoryInput): Promise<Category> {
    return api.post<Category>(`/categories`, input);
  },
  update(id: string, input: UpdateCategoryInput): Promise<Category> {
    return api.patch<Category>(`/categories/${id}`, input);
  },
  delete(id: string): Promise<null> {
    return api.delete<null>(`/categories/${id}`);
  },
};

export const productsApi = {
  list(
    query: ProductQuery,
  ): Promise<PaginatedResult<Product & { stock_level?: number }>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.categoryId) params.set('categoryId', query.categoryId);
    if (query.type) params.set('type', query.type);
    if (query.isActive !== undefined) params.set('isActive', query.isActive);
    if (query.lowStock !== undefined) params.set('lowStock', query.lowStock);
    return api.get(`/products?${params.toString()}`);
  },
  get(id: string): Promise<
    Product & {
      stock_levels?: Array<{ branch_id: string; quantity: number; reserved_quantity: number }>;
      device_units_count?: number;
    }
  > {
    return api.get(`/products/${id}`);
  },
  create(input: CreateProductInput): Promise<Product> {
    return api.post<Product>(`/products`, input);
  },
  update(id: string, input: UpdateProductInput): Promise<Product> {
    return api.patch<Product>(`/products/${id}`, input);
  },
  delete(id: string): Promise<null> {
    return api.delete<null>(`/products/${id}`);
  },
};

export const devicesApi = {
  list(query: DeviceUnitQuery): Promise<PaginatedResult<DeviceUnit>> {
    const params = new URLSearchParams();
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));
    params.set('sortBy', query.sortBy);
    params.set('sortDir', query.sortDir);
    if (query.search) params.set('search', query.search);
    if (query.productId) params.set('productId', query.productId);
    if (query.branchId) params.set('branchId', query.branchId);
    if (query.status) params.set('status', query.status);
    return api.get(`/devices?${params.toString()}`);
  },
  getByImei(imei: string): Promise<DeviceUnit> {
    return api.get<DeviceUnit>(`/devices/imei/${imei}`);
  },
  get(id: string): Promise<DeviceUnit> {
    return api.get<DeviceUnit>(`/devices/${id}`);
  },
  create(input: CreateDeviceUnitInput): Promise<DeviceUnit> {
    return api.post<DeviceUnit>(`/devices`, input);
  },
  batchCreate(input: BatchCreateDeviceUnitsInput): Promise<BatchImportResult> {
    return api.post<BatchImportResult>(`/devices/batch`, input);
  },
  update(id: string, input: UpdateDeviceUnitInput): Promise<DeviceUnit> {
    return api.patch<DeviceUnit>(`/devices/${id}`, input);
  },
  delete(id: string): Promise<null> {
    return api.delete<null>(`/devices/${id}`);
  },
};
