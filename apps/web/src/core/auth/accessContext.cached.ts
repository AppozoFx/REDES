import { cache } from "react";
import { getUserAccessContext } from "./accessContext";

const ACCESS_CTX_TTL_MS = Number(process.env.ACCESS_CONTEXT_CACHE_TTL_MS || "60000");
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = {
  expiresAt: number;
  value: Awaited<ReturnType<typeof getUserAccessContext>>;
};

const ttlCache = new Map<string, CacheEntry>();

// Mantiene el comportamiento actual de dedupe por request en produccion.
const getUserAccessContextRequestCached =
  process.env.NODE_ENV === "production"
    ? cache(getUserAccessContext)
    : getUserAccessContext;

function pruneCache(now: number) {
  for (const [key, entry] of ttlCache.entries()) {
    if (entry.expiresAt <= now) ttlCache.delete(key);
  }
  if (ttlCache.size <= CACHE_MAX_ENTRIES) return;
  const sorted = Array.from(ttlCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (sorted.length > CACHE_MAX_ENTRIES) {
    const [oldKey] = sorted.shift()!;
    ttlCache.delete(oldKey);
  }
}

export function invalidateUserAccessContext(uid?: string) {
  if (!uid) {
    ttlCache.clear();
    return;
  }
  ttlCache.delete(uid);
}

export async function getUserAccessContextCached(
  uid: string,
  options?: { forceRefresh?: boolean }
) {
  if (process.env.NODE_ENV !== "production") {
    return getUserAccessContext(uid);
  }

  if (options?.forceRefresh || ACCESS_CTX_TTL_MS <= 0) {
    const fresh = await getUserAccessContext(uid);
    ttlCache.set(uid, { value: fresh, expiresAt: Date.now() + Math.max(ACCESS_CTX_TTL_MS, 0) });
    pruneCache(Date.now());
    return fresh;
  }

  const now = Date.now();
  const current = ttlCache.get(uid);
  if (current && current.expiresAt > now) return current.value;

  const value = await getUserAccessContextRequestCached(uid);
  ttlCache.set(uid, { value, expiresAt: now + ACCESS_CTX_TTL_MS });
  pruneCache(now);
  return value;
}
