import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCache, resolveRangeTtl } from '../server/cache.js';

test('returns MISS on first load and HIT from memory on repeat calls', async () => {
  const cache = createMemoryCache({ ttlMs: 5000, maxEntries: 10 });
  let calls = 0;

  const first = await cache.getOrLoad('k1', async () => {
    calls += 1;
    return '{"ok":true}';
  });
  const second = await cache.getOrLoad('k1', async () => {
    calls += 1;
    return '{"ok":false}';
  });

  assert.equal(calls, 1);
  assert.equal(first.status, 'MISS');
  assert.equal(second.status, 'HIT');
  assert.equal(second.value, '{"ok":true}');
  assert.equal(cache.getStats().hits, 1);
  assert.equal(cache.getStats().misses, 1);
});

test('coalesces concurrent in-flight loads for the same key', async () => {
  const cache = createMemoryCache({ ttlMs: 5000, maxEntries: 10 });
  let calls = 0;

  const loader = () => new Promise((resolve) => {
    calls += 1;
    setTimeout(() => resolve('shared-payload'), 25);
  });

  const [a, b] = await Promise.all([
    cache.getOrLoad('same', loader),
    cache.getOrLoad('same', loader),
  ]);

  assert.equal(calls, 1);
  assert.equal(a.value, 'shared-payload');
  assert.equal(b.value, 'shared-payload');
});

test('serves stale value immediately while refreshing in the background', async () => {
  const cache = createMemoryCache({ ttlMs: 60, staleTtlMs: 2000, maxEntries: 10 });
  let version = 0;
  const loader = async () => {
    version += 1;
    return `v${version}`;
  };

  const first = await cache.getOrLoad('swr', loader);
  assert.equal(first.value, 'v1');

  await new Promise((resolve) => setTimeout(resolve, 80));

  const stale = await cache.getOrLoad('swr', loader);
  assert.equal(stale.status, 'STALE');
  assert.equal(stale.value, 'v1');

  // Allow background refresh microtask to finish before ttlMs expires
  await new Promise((resolve) => setTimeout(resolve, 15));

  const refreshed = await cache.getOrLoad('swr', loader);
  assert.equal(refreshed.status, 'HIT');
  assert.equal(refreshed.value, 'v2');
});

test('evicts the least-recently-used entry when maxEntries is exceeded', async () => {
  const cache = createMemoryCache({ ttlMs: 5000, maxEntries: 2 });

  await cache.getOrLoad('a', async () => 1);
  await cache.getOrLoad('b', async () => 2);
  // Touch 'a' so 'b' becomes least-recently-used
  await cache.getOrLoad('a', async () => 99);
  await cache.getOrLoad('c', async () => 3);

  const stats = cache.getStats();
  assert.equal(stats.size, 2);
  assert.equal(stats.evictions, 1);

  const aResult = await cache.getOrLoad('a', async () => 99);
  const bResult = await cache.getOrLoad('b', async () => 22);
  assert.equal(aResult.status, 'HIT');
  assert.equal(bResult.status, 'MISS');
});

test('uses longer TTL for historical completed date ranges than for today', () => {
  assert.equal(resolveRangeTtl('2026-11-19', '2026-11-20'), 600_000);
  assert.equal(resolveRangeTtl('2026-11-20', '2026-11-20'), 30_000);
});
