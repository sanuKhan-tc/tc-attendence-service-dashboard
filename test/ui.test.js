import test from 'node:test';
import assert from 'node:assert/strict';
import { accessSourceKind, buildCalendarWeeks, buildHistoryChartData, dataSourceLabel, filterAttendanceRows, formatAccessSource, formatDateRange, formatDurationBetween, formatTableDateRange, formatTime, getOverviewDateRange, isTodayDateRange, paginateRows, presentDaysLabel } from '../src/attendanceUi.js';

const rows = [
  { userId: 'EMP-1', employee: 'Aisha Khan', location: 'Dubai', firstIn: '2026-11-19T08:31:00Z', status: ['Late arrival'], late: true, early: false, underEight: false },
  { userId: 'EMP-2', employee: 'Omar Hassan', location: 'India - Hyderabad', firstIn: '2026-11-19T09:30:00Z', status: ['Early checkout'], late: false, early: true, underEight: false },
  { userId: 'EMP-3', employee: 'Priya Nair', location: 'India - Chennai', firstIn: '2026-11-19T09:35:00Z', status: ['Late arrival'], late: true, early: false, underEight: false },
];

test('formats SQL wall-clock timestamps as local display time', () => {
  assert.equal(formatTime('2026-11-19T08:31:00Z'), '08:31');
  assert.equal(formatTime(null), '—');
});

test('computes total hours from first-in and last-out timestamps', () => {
  assert.equal(formatDurationBetween('2026-11-19T08:30:00Z', '2026-11-19T17:00:00Z'), '8h 30m');
  assert.equal(formatDurationBetween('2026-11-19T08:30:00Z', null), '—');
});

test('formats first-in and last-out punch sources', () => {
  assert.equal(formatAccessSource('Face ID', 'Door Access'), 'In: Face ID · Out: Door Access');
  assert.equal(formatAccessSource('Face ID', null), 'In: Face ID · Out: —');
});

test('classifies punch sources for colored pills', () => {
  assert.equal(accessSourceKind('Door Access'), 'door-access');
  assert.equal(accessSourceKind('Face ID'), 'face-id');
  assert.equal(accessSourceKind(null), 'unknown');
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

test('builds overview date presets from local calendar dates', () => {
  const today = new Date(2026, 0, 15);

  assert.deepEqual(getOverviewDateRange('latest', today), { startDate: '', endDate: '' });
  assert.deepEqual(getOverviewDateRange('today', today), { startDate: '2026-01-15', endDate: '2026-01-15' });
  assert.deepEqual(getOverviewDateRange('yesterday', today), { startDate: '2026-01-14', endDate: '2026-01-14' });
  assert.deepEqual(getOverviewDateRange('week', today), { startDate: '2026-01-11', endDate: '2026-01-15' });
  assert.deepEqual(getOverviewDateRange('month', today), { startDate: '2026-01-01', endDate: '2026-01-15' });
  assert.deepEqual(getOverviewDateRange('last-3-months', today), { startDate: '2025-11-01', endDate: '2026-01-15' });
  assert.deepEqual(getOverviewDateRange('last-6-months', today), { startDate: '2025-08-01', endDate: '2026-01-15' });
  assert.deepEqual(getOverviewDateRange('week', new Date(2026, 0, 11)), { startDate: '2026-01-11', endDate: '2026-01-11' });
});

test('recognizes only an exact today overview date', () => {
  const today = new Date(2026, 0, 15);

  assert.equal(isTodayDateRange('2026-01-15', '2026-01-15', today), true);
  assert.equal(isTodayDateRange('2026-01-14', '2026-01-14', today), false);
  assert.equal(isTodayDateRange('2026-01-01', '2026-01-15', today), false);
});
