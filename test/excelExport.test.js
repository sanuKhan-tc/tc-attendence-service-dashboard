import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceExportRows } from '../src/excelExport.js';

test('builds Excel rows with the report columns and readable status', () => {
  assert.deepEqual(buildAttendanceExportRows([
    {
      employee: 'Aisha Khan',
      userId: 'EMP-101',
      location: 'Dubai',
      date: '2026-10-12',
      firstIn: '2026-10-12T08:37:00Z',
      lastOut: null,
      recordedTime: '—',
      status: ['Late arrival'],
    },
  ]), [
    {
      Employee: 'Aisha Khan',
      'Employee ID': 'EMP-101',
      Date: '2026-10-12',
      Location: 'Dubai',
      'First in': '08:37',
      'Last out': 'In office',
      'Recorded time': '—',
      Status: 'Late arrival',
    },
  ]);
});
