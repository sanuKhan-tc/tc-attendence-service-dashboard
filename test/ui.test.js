import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarWeeks, buildHistoryChartData, dataSourceLabel, filterAttendanceRows, formatDateRange, formatTableDateRange, formatTime, paginateRows, presentDaysLabel } from '../src/attendanceUi.js';

const rows = [
  { userId: 'EMP-1', employee: 'Aisha Khan', location: 'Dubai', firstIn: '2026-11-19T08:31:00Z', status: ['Late arrival'], late: true, early: false, underEight: false },
  { userId: 'EMP-2', employee: 'Omar Hassan', location: 'India - Hyderabad', firstIn: '2026-11-19T09:30:00Z', status: ['Early checkout'], late: false, early: true, underEight: false },
  { userId: 'EMP-3', employee: 'Priya Nair', location: 'India - Chennai', firstIn: '2026-11-19T09:35:00Z', status: ['Late arrival'], late: true, early: false, underEight: false },
];

test('formats SQL wall-clock timestamps as local display time', () => {
  assert.equal(formatTime('2026-11-19T08:31:00Z'), '08:31');
  assert.equal(formatTime(null), '—');
});

test('filters by location, employee search, and report tab', () => {
  assert.deepEqual(filterAttendanceRows(rows, { location: 'India', search: '', tab: 'all' }).map((row) => row.userId), ['EMP-2', 'EMP-3']);
  assert.deepEqual(filterAttendanceRows(rows, { location: 'India - Hyderabad', search: '', tab: 'all' }).map((row) => row.userId), ['EMP-2']);
  assert.deepEqual(filterAttendanceRows(rows, { location: 'All', search: 'aisha', tab: 'all' }).map((row) => row.userId), ['EMP-1']);
  assert.deepEqual(filterAttendanceRows(rows, { location: 'All', search: '', tab: 'early' }).map((row) => row.userId), ['EMP-2']);
});

test('paginates user report rows and clamps out-of-range pages', () => {
  const sample = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
  const page2 = paginateRows(sample, 2, 10);
  const clamped = paginateRows(sample, 99, 10);

  assert.equal(page2.page, 2);
  assert.equal(page2.totalPages, 3);
  assert.equal(page2.total, 23);
  assert.deepEqual(page2.rows.map((item) => item.id), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(clamped.page, 3);
  assert.deepEqual(clamped.rows.map((item) => item.id), [21, 22, 23]);
});

test('builds compact chart data from user history rows', () => {
  assert.deepEqual(buildHistoryChartData([
    { date: '2026-11-18', recordedMinutes: 480, late: false, early: false, underEight: false },
    { date: '2026-11-19', recordedMinutes: null, late: true, early: true, underEight: true },
  ]), [
    { date: '2026-11-18', minutes: 480, late: false, early: false, underEight: false },
    { date: '2026-11-19', minutes: 0, late: true, early: true, underEight: true },
  ]);
});

test('builds a month calendar with attendance rows on their dates', () => {
  const weeks = buildCalendarWeeks([{ date: '2026-11-19', late: true }], '2026-11');
  const day = weeks.flat().find((cell) => cell.date === '2026-11-19');

  assert.equal(weeks.length, 5);
  assert.equal(day.row.late, true);
});

test('shows no records when a user has no present days', () => {
  assert.equal(presentDaysLabel([]), 'No records');
  assert.equal(presentDaysLabel([{ date: '2026-11-19' }, { date: '2026-11-20' }]), '2');
});

test('labels the configured attendance source', () => {
  assert.equal(dataSourceLabel('true'), 'Live data');
  assert.equal(dataSourceLabel('false'), 'Local backup data');
  assert.equal(dataSourceLabel(undefined), 'Local backup data');
});

test('formats overview date ranges', () => {
  assert.equal(formatDateRange('', ''), 'Latest available');
  assert.equal(formatDateRange('2026-10-12', '2026-10-12'), '2026-10-12');
  assert.equal(formatDateRange('2026-10-01', '2026-10-12'), '2026-10-01 – 2026-10-12');
});

test('formats flagged-table dates as a single date or compact range', () => {
  assert.equal(formatTableDateRange('2026-10-12', '2026-10-12'), '12/Oct');
  assert.equal(formatTableDateRange('2026-10-01', '2026-10-12'), '01/Oct – 12/Oct');
});
