import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';
import { createMemoryCache, resolveRangeTtl } from './cache.js';
import { resolveAttendanceDateRange } from './dateRange.js';
import {
  closePool,
  fetchAttendanceHistoryRows,
  fetchAttendanceRows,
  fetchAttendanceUsers,
  fetchLatestAttendanceDate,
} from './db.js';
import { ALLOWED_LOCATIONS, buildConsolidatedReport, toClientReport } from './attendance.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

const latestDateCache = createMemoryCache({ ttlMs: 60_000, staleTtlMs: 120_000, maxEntries: 1 });
const usersCache = createMemoryCache({ ttlMs: 300_000, staleTtlMs: 600_000, maxEntries: 1 });
const attendanceCache = createMemoryCache({ ttlMs: 30_000, staleTtlMs: 90_000, maxEntries: 150 });
const historyCache = createMemoryCache({ ttlMs: 30_000, staleTtlMs: 90_000, maxEntries: 150 });

function createRequestSignal(request, response) {
  const controller = new AbortController();
  const onClose = () => {
    if (!response.writableEnded) controller.abort();
  };
  request.on('close', onClose);
  response.once('finish', () => request.off('close', onClose));
  return controller.signal;
}

function today() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function isForceRefresh(request) {
  return request.query.refresh === '1' || request.query.refresh === 'true';
}

async function buildAttendanceJson(startDate, endDate, { page, pageSize, location, search, tab, signal }) {
  const result = await fetchAttendanceRows(startDate, endDate, { page, pageSize, location, search, tab, signal });
  return JSON.stringify({
    date: startDate === endDate ? startDate : null,
    startDate,
    endDate,
    ...buildConsolidatedReport(result.rows),
    summary: result.summary,
    pagination: { page, pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) },
  });
}

app.get('/api/attendance', async (request, response) => {
  const requestedStartDate = String(request.query.startDate || request.query.date || '').trim();
  const requestedEndDate = String(request.query.endDate || request.query.date || '').trim();
  const forceRefresh = isForceRefresh(request);
  const signal = createRequestSignal(request, response);

  try {
    const todayDate = today();
    let fallbackDate = '';
    if (!requestedStartDate && !requestedEndDate) {
      const latest = await latestDateCache.getOrLoad('latest', () => fetchLatestAttendanceDate(), { forceRefresh });
      fallbackDate = latest.value || todayDate;
    }

    const { startDate, endDate } = resolveAttendanceDateRange(requestedStartDate, requestedEndDate, fallbackDate);
    const page = boundedInteger(request.query.page, 1, 1, 100000);
    const pageSize = boundedInteger(request.query.pageSize, 10, 1, 100);
    const location = ALLOWED_LOCATIONS.includes(request.query.location) ? request.query.location : 'All';
    const tab = ['all', 'late', 'early', 'underEight'].includes(request.query.tab) ? request.query.tab : 'all';
    const search = String(request.query.search || '').trim().slice(0, 100);
    const cacheKey = `${startDate}|${endDate}|${page}|${pageSize}|${location}|${tab}|${search.toLowerCase()}`;
    const ttlOverrideMs = resolveRangeTtl(endDate, todayDate);
    const staleOverrideMs = endDate < todayDate ? 300_000 : 90_000;

    const { value: json, status } = await attendanceCache.getOrLoad(
      cacheKey,
      () => buildAttendanceJson(startDate, endDate, { page, pageSize, location, search, tab, signal }),
      { forceRefresh, coalesce: !forceRefresh, ttlOverrideMs, staleOverrideMs },
    );

    if (signal.aborted) return;
    response.set('X-Cache', status);
    response.set('Cache-Control', `private, max-age=${Math.round(ttlOverrideMs / 1000)}`);
    response.type('application/json').send(json);
  } catch (error) {
    if (error.name === 'AbortError' || signal.aborted) return;
    if (error instanceof RangeError) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'Unable to read attendance from COSEC.' });
  }
});

app.get('/api/attendance/history', async (request, response) => {
  const userId = String(request.query.userId || '').trim();
  let from = String(request.query.from || '').trim();
  let to = String(request.query.to || '').trim();
  const forceRefresh = isForceRefresh(request);
  const todayDate = today();

  if (!from && !to) {
    try {
      const latest = await latestDateCache.getOrLoad('latest', () => fetchLatestAttendanceDate(), { forceRefresh });
      from = latest.value || todayDate;
      to = from;
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: 'Unable to resolve the latest attendance date.' });
      return;
    }
  }

  if (!userId || !from || !to || from > to) {
    response.status(400).json({ error: 'userId, from, and to are required.' });
    return;
  }

  const signal = createRequestSignal(request, response);
  const cacheKey = `${userId}|${from}|${to}`;
  const ttlOverrideMs = resolveRangeTtl(to, todayDate);
  const staleOverrideMs = to < todayDate ? 300_000 : 90_000;

  try {
    const { value: json, status } = await historyCache.getOrLoad(
      cacheKey,
      async () => {
        const rows = await fetchAttendanceHistoryRows(userId, from, to, signal);
        return JSON.stringify({ userId, from, to, ...toClientReport(rows) });
      },
      { forceRefresh, coalesce: !forceRefresh, ttlOverrideMs, staleOverrideMs },
    );

    if (signal.aborted) return;
    response.set('X-Cache', status);
    response.set('Cache-Control', `private, max-age=${Math.round(ttlOverrideMs / 1000)}`);
    response.type('application/json').send(json);
  } catch (error) {
    if (error.name === 'AbortError' || signal.aborted) return;
    console.error(error);
    response.status(500).json({ error: 'Unable to read user history from COSEC.' });
  }
});

app.get('/api/attendance/users', async (request, response) => {
  const forceRefresh = isForceRefresh(request);
  try {
    const { value: json, status } = await usersCache.getOrLoad(
      'users',
      async () => JSON.stringify({ users: await fetchAttendanceUsers() }),
      { forceRefresh },
    );
    response.set('X-Cache', status);
    response.set('Cache-Control', 'private, max-age=300');
    response.type('application/json').send(json);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Unable to read employees from COSEC.' });
  }
});

app.get('/api/cache/stats', (_request, response) => {
  response.json({
    latestDate: latestDateCache.getStats(),
    users: usersCache.getStats(),
    attendance: attendanceCache.getStats(),
    history: historyCache.getStats(),
  });
});

app.use(express.static(path.resolve(currentDir, '../dist')));

async function warmCaches() {
  try {
    const todayDate = today();
    const [latestResult] = await Promise.all([
      latestDateCache.getOrLoad('latest', () => fetchLatestAttendanceDate()),
      usersCache.getOrLoad('users', async () => JSON.stringify({ users: await fetchAttendanceUsers() })),
    ]);
    const latestDate = latestResult.value || todayDate;
    const cacheKey = `${latestDate}|${latestDate}|1|10|All|all|`;
    const ttlOverrideMs = resolveRangeTtl(latestDate, todayDate);
    await attendanceCache.getOrLoad(
      cacheKey,
      () => buildAttendanceJson(latestDate, latestDate, { page: 1, pageSize: 10, location: 'All', search: '', tab: 'all' }),
      { ttlOverrideMs },
    );
  } catch {
    // Non-blocking warm-up: ignore startup DB errors so server stays ready
  }
}

const server = app.listen(port, () => {
  console.log(`Attendance API listening on http://localhost:${port}`);
  if (process.env.DISABLE_CACHE_WARMUP !== 'true') {
    warmCaches();
  }
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
