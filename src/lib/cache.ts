const MAX_ENTRIES = 500;

interface Entry<V> {
  value: V;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

let dbVersion = 0;

export function bumpDbVersion(): void {
  dbVersion++;
}

function prune(): void {
  const t = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= t) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export async function cachedQuery<T>(
  namespace: string,
  ttlMs: number,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const cacheKey = `${namespace}:v${dbVersion}:${key}`;
  const t = Date.now();
  const hit = store.get(cacheKey);
  if (hit && hit.expiresAt > t) return hit.value as T;

  const value = await fn();
  prune();
  store.set(cacheKey, { value, expiresAt: t + ttlMs });
  return value;
}
