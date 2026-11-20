import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMETRIC_DEVICES, buildAttendanceReport, buildConsolidatedReport } from '../server/attendance.js';

const event = (overrides = {}) => ({
  userId: 'EMP-1',
  employee: 'Aisha Khan',
  location: 'Dubai',
  deviceName: 'TA-tc Dubai-Device-1',
  eventTime: '2026-11-19T08:30:00',
  workTime: null,
  ...overrides,
});

test('keeps the hard-coded biometric device locations and workday rules', () => {
  assert.deepEqual(BIOMETRIC_DEVICES, [
    { mid: 15, name: 'TA-tc Dubai-Device-1', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00' },
    { mid: 12, name: 'TC-Hyderabad', location: 'India - Hyderabad', lateCutoff: '10:00', officeEnd: '18:30' },
    { mid: 13, name: 'TC-Noida', location: 'India - Noida', lateCutoff: '10:00', officeEnd: '18:30' },
    { mid: 16, name: 'TC- Chennai', location: 'India - Chennai', lateCutoff: '10:30', officeEnd: '19:00' },
    { mid: 14, name: 'techcarrot-Cafeteria', location: 'India - Cafeteria', lateCutoff: '10:00', officeEnd: '18:30' },
  ]);
});

test('flags late arrivals at the location-specific cutoff', () => {
  const { rows } = buildAttendanceReport([
    event({ eventTime: '2026-11-19T08:30:00' }),
    event({ userId: 'EMP-2', employee: 'Omar Hassan', location: 'India - Hyderabad', deviceName: 'TC-Hyderabad', eventTime: '2026-11-19T10:01:00' }),
    event({ userId: 'EMP-3', employee: 'Priya Nair', location: 'India - Chennai', deviceName: 'TC- Chennai', eventTime: '2026-11-19T10:30:00' }),
    event({ userId: 'EMP-4', employee: 'Karthik Rao', location: 'India - Chennai', deviceName: 'TC- Chennai', eventTime: '2026-11-19T10:31:00' }),
  ]);

  assert.equal(rows.find((row) => row.userId === 'EMP-1').late, false);
  assert.equal(rows.find((row) => row.userId === 'EMP-2').late, true);
  assert.equal(rows.find((row) => row.userId === 'EMP-3').late, false);
  assert.equal(rows.find((row) => row.userId === 'EMP-4').late, true);
});

test('treats SQL datetime values as local wall-clock time when serialized with Z', () => {
  const { rows } = buildAttendanceReport([event({ eventTime: '2026-11-19T08:30:00.000Z' })]);

  assert.equal(rows[0].late, false);
});

test('flags early checkout using the location-specific office end time', () => {
  const { rows } = buildAttendanceReport([
    event({ eventTime: '2026-11-19T08:30:00', lastEventTime: '2026-11-19T16:59:00' }),
    event({ userId: 'EMP-2', employee: 'Omar Hassan', location: 'India - Hyderabad', deviceName: 'TC-Hyderabad', eventTime: '2026-11-19T09:30:00', lastEventTime: '2026-11-19T18:29:00' }),
    event({ userId: 'EMP-3', employee: 'Priya Nair', location: 'India - Chennai', deviceName: 'TC- Chennai', eventTime: '2026-11-19T10:00:00', lastEventTime: '2026-11-19T18:59:00' }),
    event({ userId: 'EMP-4', employee: 'Karthik Rao', location: 'India - Chennai', deviceName: 'TC- Chennai', eventTime: '2026-11-19T10:00:00', lastEventTime: '2026-11-19T19:00:00' }),
  ]);

  assert.equal(rows.find((row) => row.userId === 'EMP-1').early, true);
  assert.equal(rows.find((row) => row.userId === 'EMP-2').early, true);
  assert.equal(rows.find((row) => row.userId === 'EMP-3').early, true);
  assert.equal(rows.find((row) => row.userId === 'EMP-4').early, false);
});

test('shows one event as in office and does not invent a checkout', () => {
  const { rows } = buildAttendanceReport([event({ workTime: 484 })]);

  assert.equal(rows[0].lastOut, null);
  assert.equal(rows[0].lastOutLabel, 'In office');
  assert.equal(rows[0].recordedMinutes, null);
  assert.equal(rows[0].recordedTime, '—');
});

test('deduplicates a user across biometric devices using the first event location', () => {
  const { rows } = buildAttendanceReport([
    event({ eventTime: '2026-11-19T08:31:00', lastEventTime: '2026-11-19T17:10:00' }),
    event({ eventTime: '2026-11-19T09:00:00', location: 'India', deviceName: 'TC-Noida', lastEventTime: '2026-11-19T17:10:00' }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].location, 'Dubai');
});

test('returns an empty report for an empty date', () => {
  assert.deepEqual(buildAttendanceReport([]), { rows: [], summary: { late: 0, early: 0, underEight: 0 } });
});

test('includes the attendance date for user history rows', () => {
  const { rows } = buildAttendanceReport([
    event({ eventTime: '2026-11-18T08:30:00', lastEventTime: '2026-11-18T17:00:00' }),
    event({ eventTime: '2026-11-19T08:31:00', lastEventTime: '2026-11-19T17:01:00' }),
  ]);

  assert.deepEqual(rows.map((row) => row.date), ['2026-11-18', '2026-11-19']);
});

test('consolidates late logins, early checkouts, and all statuses per employee', () => {
  const report = buildConsolidatedReport([
    {
      userId: 'EMP-1',
      employee: 'Aisha Khan',
      location: 'Dubai',
      firstIn: '2026-11-19T08:40:00',
      lastEvent: '2026-11-19T16:45:00',
      lateCount: 3,
      earlyCount: 2,
      underEightCount: 1,
    },
    { userId: 'EMP-2', employee: 'Omar Hassan', location: 'India - Hyderabad', lateCount: 0, earlyCount: 1, underEightCount: 0 },
  ]);

  assert.deepEqual(report.rows[0], {
    userId: 'EMP-1',
    employee: 'Aisha Khan',
    location: 'Dubai',
    firstIn: '2026-11-19T08:40:00.000Z',
    lastOut: '2026-11-19T16:45:00.000Z',
    lateCount: 3,
    earlyCount: 2,
    underEightCount: 1,
    late: true,
    early: true,
    underEight: true,
    status: ['Late arrival', 'Early checkout', 'Under 8 hours'],
  });
  assert.deepEqual(report.rows[1].status, ['Early checkout']);
  assert.deepEqual(report.summary, { late: 1, early: 2, underEight: 1 });
});
