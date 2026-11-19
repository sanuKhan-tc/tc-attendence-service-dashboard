import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAttendanceDateRange } from '../server/dateRange.js';

test('uses the latest available date for an empty overview range', () => {
  assert.deepEqual(resolveAttendanceDateRange('', '', '2026-10-12'), {
    startDate: '2026-10-12',
    endDate: '2026-10-12',
  });
});

test('uses one selected date for both range boundaries', () => {
  assert.deepEqual(resolveAttendanceDateRange('2026-10-11', '', '2026-10-12'), {
    startDate: '2026-10-11',
    endDate: '2026-10-11',
  });
});

test('rejects an inverted overview date range', () => {
  assert.throws(() => resolveAttendanceDateRange('2026-10-12', '2026-10-01', '2026-10-12'), /startDate must be before or equal to endDate/);
});
