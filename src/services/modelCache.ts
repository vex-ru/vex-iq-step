/**
 * IndexedDB Local Storage Cache for VEX IQ 3D STL & 3MF Models
 * Ensures sub-millisecond instant loads upon revisiting parts, full offline support,
 * and high storage capacity (hundreds of MBs) without choking memory or localstorage.
 */

const DB_NAME = 'VexIqModelCache_v1';
const STORE_NAME = 'models';
const DB_VERSION = 1;

export interface CachedModelMeta {
  path: string;
  size: number;
  cachedAt: number;
  mimeType?: string;
  source: 'remote' | 'user-upload' | 'procedural';
}

interface CacheEntry {
  path: string;
  data: ArrayBuffer;
  size: number;
  cachedAt: number;
  source: 'remote' | 'user-upload' | 'procedural';
}

// In-memory fallback if IndexedDB is inaccessible
const memoryCache = new Map<string, CacheEntry>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
        store.createIndex('source', 'source', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Get a cached model ArrayBuffer by relative path or key
 */
export async function getCachedModel(path: string): Promise<ArrayBuffer | null> {
  const normalizedPath = path.trim().toLowerCase();

  // Check memory fallback first
  if (memoryCache.has(normalizedPath)) {
    return memoryCache.get(normalizedPath)!.data.slice(0);
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(normalizedPath);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry && entry.data) {
          // Warm memory cache
          memoryCache.set(normalizedPath, entry);
          resolve(entry.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('[ModelCache] Read error fallback:', err);
    return null;
  }
}

/**
 * Save model ArrayBuffer into IndexedDB and memory
 */
export async function saveCachedModel(
  path: string,
  buffer: ArrayBuffer,
  source: 'remote' | 'user-upload' | 'procedural' = 'remote'
): Promise<void> {
  const normalizedPath = path.trim().toLowerCase();
  const entry: CacheEntry = {
    path: normalizedPath,
    data: buffer,
    size: buffer.byteLength,
    cachedAt: Date.now(),
    source,
  };

  memoryCache.set(normalizedPath, entry);

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[ModelCache] Write error:', err);
  }
}

/**
 * Query cache statistics: total entries, storage space used in MB, list of cached files
 */
export async function getCacheStats(): Promise<{
  count: number;
  totalBytes: number;
  items: CachedModelMeta[];
}> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const all = (req.result as CacheEntry[]) || [];
        let total = 0;
        const metas: CachedModelMeta[] = all.map((entry) => {
          total += entry.size || 0;
          return {
            path: entry.path,
            size: entry.size,
            cachedAt: entry.cachedAt,
            source: entry.source,
          };
        });

        resolve({
          count: metas.length,
          totalBytes: total,
          items: metas,
        });
      };

      req.onerror = () => {
        resolve({ count: 0, totalBytes: 0, items: [] });
      };
    });
  } catch {
    let total = 0;
    const metas: CachedModelMeta[] = [];
    memoryCache.forEach((v) => {
      total += v.size;
      metas.push({ path: v.path, size: v.size, cachedAt: v.cachedAt, source: v.source });
    });
    return { count: metas.length, totalBytes: total, items: metas };
  }
}

/**
 * Delete a single cached entry
 */
export async function deleteCachedModel(path: string): Promise<boolean> {
  const normalized = path.trim().toLowerCase();
  memoryCache.delete(normalized);

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(normalized);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Purge entire local model cache
 */
export async function clearModelCache(): Promise<void> {
  memoryCache.clear();
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[ModelCache] Clear error:', err);
  }
}
