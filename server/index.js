import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import dotenv from 'dotenv';
import { resolveAttendanceDateRange } from './dateRange.js';
import { fetchAttendanceHistoryRows, fetchAttendanceRows, fetchAttendanceUsers, fetchLatestAttendanceDate } from './db.js';
import { toClientReport } from './attendance.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

function today() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

app.get('/api/attendance', async (request, response) => {
  const requestedStartDate = String(request.query.startDate || request.query.date || '').trim();
  const requestedEndDate = String(request.query.endDate || request.query.date || '').trim();

  try {
    const fallbackDate = requestedStartDate || requestedEndDate ? '' : await fetchLatestAttendanceDate() || today();
    const { startDate, endDate } = resolveAttendanceDateRange(requestedStartDate, requestedEndDate, fallbackDate);
    const page = boundedInteger(request.query.page, 1, 1, 100000);
    const pageSize = boundedInteger(request.query.pageSize, 10, 1, 100);
    const location = ['All', 'Dubai', 'India'].includes(request.query.location) ? request.query.location : 'All';
    const tab = ['all', 'late', 'early', 'underEight'].includes(request.query.tab) ? request.query.tab : 'all';
    const search = String(request.query.search || '').trim().slice(0, 100);
    const result = await fetchAttendanceRows(startDate, endDate, { page, pageSize, location, search, tab });
    response.json({
      date: startDate === endDate ? startDate : null,
      startDate,
      endDate,
      ...toClientReport(result.rows),
      summary: result.summary,
      pagination: { page, pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) },
    });
  } catch (error) {
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
  const from = String(request.query.from || '').trim();
  const to = String(request.query.to || '').trim();

  if (!userId || !from || !to || from > to) {
    response.status(400).json({ error: 'userId, from, and to are required.' });
    return;
  }

  try {
    const rows = await fetchAttendanceHistoryRows(userId, from, to);
    response.json({ userId, from, to, ...toClientReport(rows) });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Unable to read user history from COSEC.' });
  }
});

app.get('/api/attendance/users', async (_request, response) => {
  try {
    response.json({ users: await fetchAttendanceUsers() });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Unable to read employees from COSEC.' });
  }
});

app.use(express.static(path.resolve(currentDir, '../dist')));

app.listen(port, () => {
  console.log(`Attendance API listening on http://localhost:${port}`);
});
