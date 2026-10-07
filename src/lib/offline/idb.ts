/**
 * IndexedDB wrapper — shop ERP offline storage.
 *
 * DB version 2 adds a 'products' object store with indexes for fast
 * offline search (by name, barcode). This enables the POS to search
 * products locally when the network is down.
 *
 * Stores:
 *   rows     — cached API responses (key = full URL)
 *   outbox   — pending write operations (keyPath = id)
 *   meta     — misc metadata (lastSyncAt, etc.)
 *   products — all products for offline POS search (keyPath = id, indexes on name + barcode)
 */

const DB_NAME = 'shop-erp-offline'
const DB_VERSION = 2

export type StoreName = 'rows' | 'outbox' | 'meta' | 'products'

export function idbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!idbAvailable()) return Promise.reject(new Error('IndexedDB unavailable'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // v1 stores
      if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows')
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      // v2: products store with indexes for offline search
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' })
        productStore.createIndex('byName', 'name', { unique: false })
        productStore.createIndex('byBarcode', 'barcode', { unique: false })
        productStore.createIndex('byActive', 'active', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      })
  )
}

// ── Outbox entry type ──
export interface OutboxEntry {
  id: string
  url: string
  method: string
  body: any
  label: string
  createdAt: number
  tries: number
  lastError?: string
}

export const idb = {
  // ── rows store (cached API responses by URL) ──
  async getCached<T = any>(url: string): Promise<{ data: T; at: number } | null> {
    if (!idbAvailable()) return null
    return tx('rows', 'readonly', (s) => s.get(url) as IDBRequest<any>).catch(() => null)
  },

  async setCached(url: string, data: any): Promise<void> {
    if (!idbAvailable()) return
    await tx('rows', 'readwrite', (s) => s.put({ data, at: Date.now() }, url)).catch(() => {})
  },

  /**
   * 🛡️ PWA (2026-10-07): حذف مفتاح واحد من الكاش بشكل مستهدف — بدون مسح
   * كل الصفوف. بتُستخدم أساساً لمسح نسخة السيشن المحفوظة ('/api/auth/me')
   * عند تسجيل الخروج أو عند 401 حقيقي من السيرفر، عشان مستخدم تاني على
   * نفس الجهاز (أو نفس المستخدم بعد انتهاء السيشن) ميرجعش للنظام بحساب
   * قديم كان محفوظ أوفلاين.
   */
  async removeCached(url: string): Promise<void> {
    if (!idbAvailable()) return
    await tx('rows', 'readwrite', (s) => s.delete(url) as IDBRequest).catch(() => {})
  },

  async clearCache(): Promise<void> {
    if (!idbAvailable()) return
    await tx('rows', 'readwrite', (s) => s.clear() as IDBRequest).catch(() => {})
  },

  // ── products store (offline POS search) ──
  /**
   * Replace ALL products in IndexedDB with a fresh batch from the server.
   * Called by the pre-warm engine when online.
   */
  async replaceProducts(products: any[]): Promise<void> {
    if (!idbAvailable() || !products.length) return
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction('products', 'readwrite')
      const store = t.objectStore('products')
      store.clear()
      for (const p of products) {
        if (p && p.id !== undefined) store.put(p)
      }
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  },

  /**
   * Search products offline by name or barcode.
   * Returns up to 50 matching products.
   */
  async searchProducts(query: string): Promise<any[]> {
    if (!idbAvailable() || !query.trim()) return []
    const db = await openDB()
    return new Promise<any[]>((resolve, reject) => {
      const t = db.transaction('products', 'readonly')
      const store = t.objectStore('products')
      const idx = store.index('byName')
      const range = IDBKeyRange.bound(query, query + '\uffff')
      const req = idx.getAll(range)
      req.onsuccess = () => {
        const results = (req.result as any[]).filter((p) => p.active !== false)
        // Also search by barcode
        const barcodeIdx = store.index('byBarcode')
        const barcodeRange = IDBKeyRange.bound(query, query + '\uffff')
        const barcodeReq = barcodeIdx.getAll(barcodeRange)
        barcodeReq.onsuccess = () => {
          const barcodeResults = (barcodeReq.result as any[]).filter(
            (p) => p.active !== false && !results.some((r) => r.id === p.id)
          )
          // Combine + deduplicate + limit
          const all = [...results, ...barcodeResults].slice(0, 50)
          resolve(all)
        }
        barcodeReq.onerror = () => resolve(results.slice(0, 50))
      }
      req.onerror = () => reject(req.error)
    })
  },

  /**
   * Get a single product by ID (for POS add-to-cart).
   */
  async getProductById(id: number): Promise<any | null> {
    if (!idbAvailable()) return null
    const db = await openDB()
    return new Promise<any>((resolve, reject) => {
      const t = db.transaction('products', 'readonly')
      const req = t.objectStore('products').get(id)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  },

  /**
   * Get all products (for inventory/dashboard views offline).
   */
  async getAllProducts(): Promise<any[]> {
    if (!idbAvailable()) return []
    const db = await openDB()
    return new Promise<any[]>((resolve, reject) => {
      const t = db.transaction('products', 'readonly')
      const req = t.objectStore('products').getAll()
      req.onsuccess = () => resolve((req.result as any[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  },

  /**
   * Count products in cache (for the pre-warm indicator).
   */
  async productCount(): Promise<number> {
    if (!idbAvailable()) return 0
    const db = await openDB()
    return new Promise<number>((resolve, reject) => {
      const t = db.transaction('products', 'readonly')
      const req = t.objectStore('products').count()
      req.onsuccess = () => resolve(req.result ?? 0)
      req.onerror = () => reject(req.error)
    })
  },

  // ── outbox store (pending write operations) ──
  async getOutbox(): Promise<OutboxEntry[]> {
    if (!idbAvailable()) return []
    const all = await tx<OutboxEntry[]>('outbox', 'readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>).catch(() => [] as OutboxEntry[])
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt)
  },

  async addToOutbox(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'tries'>): Promise<void> {
    if (!idbAvailable()) return
    const full: OutboxEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: Date.now(),
      tries: 0,
    }
    await tx('outbox', 'readwrite', (s) => s.put(full) as IDBRequest).catch(() => {})
    notifyOutboxChange()
  },

  async removeFromOutbox(id: string): Promise<void> {
    if (!idbAvailable()) return
    await tx('outbox', 'readwrite', (s) => s.delete(id) as IDBRequest).catch(() => {})
    notifyOutboxChange()
  },

  async updateOutboxEntry(entry: OutboxEntry): Promise<void> {
    if (!idbAvailable()) return
    await tx('outbox', 'readwrite', (s) => s.put(entry) as IDBRequest).catch(() => {})
    notifyOutboxChange()
  },

  async pendingCount(): Promise<number> {
    if (!idbAvailable()) return 0
    const all = await this.getOutbox()
    return all.length
  },

  async clearOutbox(): Promise<void> {
    if (!idbAvailable()) return
    await tx('outbox', 'readwrite', (s) => s.clear() as IDBRequest).catch(() => {})
    notifyOutboxChange()
  },

  // ── meta store ──
  async getMeta<T = any>(key: string): Promise<T | null> {
    if (!idbAvailable()) return null
    return tx<T>('meta', 'readonly', (s) => s.get(key) as IDBRequest<T>).catch(() => null)
  },

  async setMeta(key: string, value: any): Promise<void> {
    if (!idbAvailable()) return
    await tx('meta', 'readwrite', (s) => s.put(value, key) as IDBRequest).catch(() => {})
  },
}

// ── Outbox change listeners ──
type Listener = (count: number) => void
const listeners = new Set<Listener>()

async function notifyOutboxChange() {
  const count = await idb.pendingCount()
  listeners.forEach((l) => l(count))
}

export function onOutboxChange(fn: Listener) {
  listeners.add(fn)
  void idb.pendingCount().then(fn)
  return () => listeners.delete(fn)
}
