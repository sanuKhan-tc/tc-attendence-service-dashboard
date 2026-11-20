export function createMemoryCache({ ttlMs, staleTtlMs = 0, maxEntries = 100 } = {}) {
  const store = new Map();
  const inFlight = new Map();
  const stats = { hits: 0, staleHits: 0, misses: 0, evictions: 0 };

  function touch(key, entry) {
    store.delete(key);
    store.set(key, entry);
  }

  function set(key, value, customTtlMs = ttlMs, customStaleTtlMs = staleTtlMs) {
    const now = Date.now();
    const freshUntil = now + customTtlMs;
    const staleUntil = freshUntil + customStaleTtlMs;

    if (store.has(key)) store.delete(key);
    store.set(key, { value, freshUntil, staleUntil });

    if (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
      stats.evictions += 1;
    }
  }

  function loadAndStore(key, loader, { coalesce = true, ttlOverrideMs, staleOverrideMs } = {}) {
    if (coalesce && inFlight.has(key)) {
      return inFlight.get(key);
    }

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        set(key, value, ttlOverrideMs ?? ttlMs, staleOverrideMs ?? staleTtlMs);
        return value;
      })
      .finally(() => {
        if (coalesce) inFlight.delete(key);
      });

    if (coalesce) inFlight.set(key, promise);
    return promise;
  }

  async function getOrLoad(key, loader, { forceRefresh = false, coalesce = true, ttlOverrideMs, staleOverrideMs } = {}) {
    const now = Date.now();

    if (!forceRefresh) {
      const entry = store.get(key);
      if (entry) {
        if (entry.freshUntil > now) {
          touch(key, entry);
          stats.hits += 1;
          return { value: entry.value, status: 'HIT' };
        }
        if (entry.staleUntil > now) {
          touch(key, entry);
          stats.staleHits += 1;
          // Refresh in background without blocking the response
          loadAndStore(key, loader, { coalesce: true, ttlOverrideMs, staleOverrideMs }).catch(() => {});
          return { value: entry.value, status: 'STALE' };
        }
        store.delete(key);
      }
    }

    stats.misses += 1;
    const value = await loadAndStore(key, loader, { coalesce, ttlOverrideMs, staleOverrideMs });
    return { value, status: 'MISS' };
  }

  function clear() {
    store.clear();
  }

  function getStats() {
    return { ...stats, size: store.size, inFlight: inFlight.size };
  }

  return { getOrLoad, set, clear, getStats };
}

export function resolveRangeTtl(endDate, todayDate, { liveTtlMs = 30_000, historicalTtlMs = 600_000 } = {}) {
  return endDate && todayDate && endDate < todayDate ? historicalTtlMs : liveTtlMs;
}
