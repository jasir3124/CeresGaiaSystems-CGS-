// Keep downloaded API results separate from user-authored field records.
const DB_NAME = 'cgs-offline-v1';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('responses');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readOffline<T>(key: string): Promise<T | null> {
  try {
    const db = await database();
    return await new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction('responses', 'readonly');
      const request = transaction.objectStore('responses').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    });
  } catch { return null; }
}
export async function writeOffline(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await database();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction('responses', 'readwrite');
      transaction.objectStore('responses').put(value, key);
      transaction.oncomplete = () => { db.close(); resolve(true); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    });
  } catch { return false; }
}
export async function offlineJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (navigator.onLine) {
    try {
      const response = await fetch(url, { signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Data unavailable');
      await writeOffline(url, json);
      return json as T;
    } catch (error) {
      if (signal?.aborted) throw error;
      const cached = await readOffline<T>(url);
      if (cached) return cached;
      throw error;
    }
  }
  const cached = await readOffline<T>(url);
  if (cached) return cached;
  throw new Error('This data has not been saved on this device yet. Connect to the internet to download it.');
}
