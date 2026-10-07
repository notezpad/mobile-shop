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

  async clearCache(): Promise<void> {
    if (!idbAvailable()) return
    await tx('rows', 'readwrite', (s) => s.clear() as IDBRequest).catch(() => {})
  },

  /**
   * 🛡️ v5: آخر نسخة مخزّنة لنفس المسار بأي query — fallback للـ GETs اللي
   * الـ query بتاعها بيتغير (تقارير بتواريخ/فلاتر فروع/إشعارات) — بدل ما
   * المطابقة الحرفية تفشل أوفلاين وترمي خطأ، بنرجّع آخر نسخة معروفة.
   * بيفضّل الأحدث (at) — وبيرجع null لو مفيش أي نسخة لنفس المسار.
   */
  async getCachedByPath(pathname: string): Promise<{ data: any; at: number } | null> {
    if (!idbAvailable() || !pathname) return null
    try {
      const db = await openDB()
      const candidates = await new Promise<string[]>((resolve) => {
        try {
          const t = db.transaction('rows', 'readonly')
          const req = t.objectStore('rows').openKeyCursor()
          const keys: string[] = []
          req.onsuccess = () => {
            const cur = req.result
            if (!cur) return resolve(keys)
            const k = String(cur.key)
            if (k === pathname || k.startsWith(pathname + '?')) keys.push(k)
            cur.continue()
          }
          req.onerror = () => resolve(keys)
        } catch {
          resolve([])
        }
      })
      if (!candidates.length) return null
      // نقرأ القيم ونفضّل الأحدث — بسقف أمان 20 مرشّح
      let best: { data: any; at: number } | null = null
      for (const k of candidates.slice(0, 20)) {
        const row = await tx<{ data: any; at: number }>('rows', 'readonly', (s) => s.get(k) as IDBRequest<any>).catch(() => null)
        if (row && (!best || row.at > best.at)) best = row
      }
      return best
    } catch {
      return null
    }
  },

  /**
   * ⚡ v10: امسح صفوف الكاش اللي بتبدأ بأي بادئة من القائمة —
   * بتُستدعى بعد أي كتابة ناجحة (invalidateApiCaches في api-offline.ts)
   * عشان الـ GET الجاي بعد الـ mutation يجيب داتا حية من الشبكة.
   */
  async purgeRows(prefixes: string[]): Promise<void> {
    if (!idbAvailable() || !prefixes.length) return
    try {
      const db = await openDB()
      await new Promise<void>((resolve) => {
        const t = db.transaction('rows', 'readwrite')
        const store = t.objectStore('rows')
        const req = store.openKeyCursor()
        req.onsuccess = () => {
          const cur = req.result
          if (!cur) return
          const k = String(cur.key)
          if (prefixes.some((p) => k.startsWith(p))) store.delete(cur.key)
          cur.continue()
        }
        t.oncomplete = () => resolve()
        t.onerror = () => resolve()
        t.onabort = () => resolve()
      })
    } catch {
      /* ignore */
    }
  },

  /**
   * 🛡️ v11 (LOCAL-FIRST): كل الصفوف المخزنة اللي مفاتيحها بتبدأ ببادئة معينة
   * — بتُستخدم من applyLocalMutation في api-offline.ts عشان بعد أي عملية
   * أوفلاين ندمج السجل الجديد جوا نسخ الكاش نفسها (بدل ما نمسحها!) فالصفحات
   * تعرض الإجراء لحظياً أوفلاين من غير ما تستنى المزامنة.
   * بسقف أمان cap (افتراضي 40 صف) عشان ما نمشيش على آلاف المفاتيح.
   */
  async getRowsByPrefix(
    prefix: string,
    cap = 40,
  ): Promise<Array<{ key: string; data: any; at: number }>> {
    if (!idbAvailable() || !prefix) return []
    try {
      const db = await openDB()
      const keys = await new Promise<string[]>((resolve) => {
        try {
          const t = db.transaction('rows', 'readonly')
          const req = t.objectStore('rows').openKeyCursor()
          const out: string[] = []
          req.onsuccess = () => {
            const cur = req.result
            if (!cur) return resolve(out)
            const k = String(cur.key)
            if (k === prefix || k.startsWith(prefix)) out.push(k)
            if (out.length >= cap) return resolve(out)
            cur.continue()
          }
          req.onerror = () => resolve(out)
        } catch {
          resolve([])
        }
      })
      const rows: Array<{ key: string; data: any; at: number }> = []
      for (const key of keys.slice(0, cap)) {
        const row = await tx<any>('rows', 'readonly', (s) => s.get(key) as IDBRequest<any>).catch(() => null)
        if (row && typeof row === 'object' && 'data' in row) {
          rows.push({ key, data: row.data, at: row.at })
        }
      }
      return rows
    } catch {
      return []
    }
  },

  // ── 🛡️ v11: كتابات مباشرة على متجر المنتجات (تعديل/حذف أوفلاين) ──
  async putProduct(p: any): Promise<void> {
    if (!idbAvailable() || !p || p.id === undefined) return
    const db = await openDB()
    await new Promise<void>((resolve) => {
      const t = db.transaction('products', 'readwrite')
      t.objectStore('products').put(p)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()
    })
  },

  async updateProduct(id: number, patch: any): Promise<void> {
    try {
      const p = await this.getProductById(id).catch(() => null)
      if (!p) return
      await this.putProduct({ ...p, ...patch, id: p.id })
    } catch {
      /* ignore */
    }
  },

  async deleteProduct(id: number): Promise<void> {
    if (!idbAvailable()) return
    try {
      const db = await openDB()
      await new Promise<void>((resolve) => {
        const t = db.transaction('products', 'readwrite')
        t.objectStore('products').delete(id)
        t.oncomplete = () => resolve()
        t.onerror = () => resolve()
        t.onabort = () => resolve()
      })
    } catch {
      /* ignore */
    }
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
   *
   * 🛡️ v5: مطابقة جزئية (substring) زي السيرفر بالظبط (contains insensitive
   * على الاسم والباركود) — النسخة القديمة كانت prefix على index IDB فكلمة
   * في نص الاسم كانت تفشل، والباركود كمان كان محتاج مطابقة من البداية.
   */
  async searchProducts(query: string): Promise<any[]> {
    if (!idbAvailable() || !query.trim()) return []
    const q = query.trim()
    const nq = q.toLowerCase()
    const all = await this.getAllProducts()
    const results = (all || []).filter((p) => {
      if (!p || p.active === false) return false
      if (String(p.name || '').toLowerCase().includes(nq)) return true
      if (String(p.barcode || '').includes(q)) return true
      return false
    })
    return results.slice(0, 50)
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

  /**
   * 🛡️ v11: بترجّع القيد الكامل بعد الإنشاء — الـ id بيُستخدم لاشتقاق
   * id مؤقت ثابت للمنتجات المضافة أوفلاين (نفس معادلة getOfflineAddedProducts
   * و remapLocalProductIds في sync.ts: -(hashStr(entry.id)+1)) عشان أي
   * فاتورة/أمر شراء يشاور على المنتج قبل المزامنة يتظبط تلقائياً.
   */
  async addToOutbox(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'tries'>): Promise<OutboxEntry | null> {
    if (!idbAvailable()) return null
    const full: OutboxEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: Date.now(),
      tries: 0,
    }
    await tx('outbox', 'readwrite', (s) => s.put(full) as IDBRequest).catch(() => {})
    notifyOutboxChange()
    return full
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

  // ── 🛡️ v5: خريطة المنتجات المضافة أوفلاين (localRef → realId) ──
  // لما منتج يتضاف أوفلاين بيتقيد في الـ outbox، ولما يُستخدم في فاتورة
  // قبل المزامنة الفاتورة بتحمل id مؤقت سالب. عند المزامنة: منتج الـ POST
  // بيرجع الـ id الحقيقي بنخزنه هنا، وبنستبدل الـ ids السالبة في باقي
  // العمليات قبل إرسالها — فمفيش فاتورة بتضيع لأن منتجها لسه محلي.
  async getLocalProductMap(): Promise<Record<string, number>> {
    const m = await this.getMeta<Record<string, number>>('localProductMap')
    return m && typeof m === 'object' ? m : {}
  },

  async setLocalProductMapEntry(localRef: string, realId: number): Promise<void> {
    const map = await this.getLocalProductMap()
    map[localRef] = realId
    await this.setMeta('localProductMap', map)
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
