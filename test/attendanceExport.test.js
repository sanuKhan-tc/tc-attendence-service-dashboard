import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllAttendanceRows } from '../src/attendanceExport.js';

test('fetches every filtered attendance page for export', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const page = new URL(url, 'http://localhost').searchParams.get('page');
    const reports = {
      '1': { rows: [{ userId: 'EMP-1' }], pagination: { totalPages: 3 } },
      '2': { rows: [{ userId: 'EMP-2' }], pagination: { totalPages: 3 } },
      '3': { rows: [{ userId: 'EMP-3' }], pagination: { totalPages: 3 } },
    };
    return { ok: true, json: async () => reports[page] };
  };

  const rows = await fetchAllAttendanceRows(fetchImpl, {
    startDate: '2026-10-01',
    endDate: '2026-10-12',
    location: 'Dubai',
    search: 'aisha',
    tab: 'late',
  });

  assert.deepEqual(rows.map((row) => row.userId), ['EMP-1', 'EMP-2', 'EMP-3']);
  assert.equal(requests.length, 3);
  assert.match(requests[0], /pageSize=100/);
  assert.match(requests[0], /location=Dubai/);
  assert.match(requests[0], /tab=late/);
});
