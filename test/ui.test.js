import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarWeeks, buildHistoryChartData, dataSourceLabel, filterAttendanceRows, formatTime, presentDaysLabel } from '../src/attendanceUi.js';

const rows = [
  { userId: 'EMP-1', employee: 'Aisha Khan', location: 'Dubai', firstIn: '2026-11-19T08:31:00Z', status: ['Late arrival'], late: true, early: false, underEight: false },
  { userId: 'EMP-2', employee: 'Omar Hassan', location: 'India', firstIn: '2026-11-19T09:30:00Z', status: ['Early checkout'], late: false, early: true, underEight: false },
];

test('formats SQL wall-clock timestamps as local display time', () => {
  assert.equal(formatTime('2026-11-19T08:31:00Z'), '08:31');
  assert.equal(formatTime(null), '—');
});

test('filters by location, employee search, and report tab', () => {
  assert.deepEqual(filterAttendanceRows(rows, { location: 'India', search: '', tab: 'all' }).map((row) => row.userId), ['EMP-2']);
  assert.deepEqual(filterAttendanceRows(rows, { location: 'All', search: 'aisha', tab: 'all' }).map((row) => row.userId), ['EMP-1']);
  assert.deepEqual(filterAttendanceRows(rows, { location: 'All', search: '', tab: 'early' }).map((row) => row.userId), ['EMP-2']);
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
