import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMETRIC_DEVICES, buildAttendanceReport } from '../server/attendance.js';

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
    { mid: 12, name: 'TC-Hyderabad', location: 'India', lateCutoff: '09:30', officeEnd: '18:00' },
    { mid: 13, name: 'TC-Noida', location: 'India', lateCutoff: '09:30', officeEnd: '18:00' },
    { mid: 16, name: 'TC- Chennai', location: 'India', lateCutoff: '09:30', officeEnd: '18:00' },
    { mid: 14, name: 'techcarrot-Cafeteria', location: 'India', lateCutoff: '09:30', officeEnd: '18:00' },
  ]);
});

test('flags late arrivals at the location-specific cutoff', () => {
  const { rows } = buildAttendanceReport([
    event({ eventTime: '2026-11-19T08:30:00' }),
    event({ userId: 'EMP-2', employee: 'Omar Hassan', location: 'India', deviceName: 'TC-Hyderabad', eventTime: '2026-11-19T09:31:00' }),
  ]);

  assert.equal(rows.find((row) => row.userId === 'EMP-1').late, false);
  assert.equal(rows.find((row) => row.userId === 'EMP-2').late, true);
});

test('treats SQL datetime values as local wall-clock time when serialized with Z', () => {
  const { rows } = buildAttendanceReport([event({ eventTime: '2026-11-19T08:30:00.000Z' })]);

  assert.equal(rows[0].late, false);
});

test('flags early checkout using the location-specific office end time', () => {
  const { rows } = buildAttendanceReport([
    event({ eventTime: '2026-11-19T08:30:00', lastEventTime: '2026-11-19T16:59:00' }),
    event({ userId: 'EMP-2', employee: 'Omar Hassan', location: 'India', deviceName: 'TC-Hyderabad', eventTime: '2026-11-19T09:30:00', lastEventTime: '2026-11-19T17:59:00' }),
  ]);

  assert.equal(rows.find((row) => row.userId === 'EMP-1').early, true);
  assert.equal(rows.find((row) => row.userId === 'EMP-2').early, true);
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
