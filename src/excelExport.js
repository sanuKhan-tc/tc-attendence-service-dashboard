import * as XLSX from 'xlsx';
import { formatTime } from './attendanceUi.js';

function formatStatusWithCount(status, row) {
  const count = status === 'Late arrival'
    ? row.lateCount
    : status === 'Early checkout'
      ? row.earlyCount
      : row.underEightCount;
  return count ? `${status} (${count})` : status;
}

export function buildAttendanceExportRows(rows, { isDateRange = false } = {}) {
  return rows.map((row) => {
    if (row.lateCount != null || row.earlyCount != null) {
      if (isDateRange) {
        return {
          Employee: row.employee,
          'Employee ID': row.userId,
          Location: row.location,
          Status: row.status.map((status) => formatStatusWithCount(status, row)).join(', ') || 'No flags',
        };
      }

      return {
        Employee: row.employee,
        'Employee ID': row.userId,
        Location: row.location,
        'First in': formatTime(row.firstIn),
        'Last out': row.lastOut ? formatTime(row.lastOut) : 'Not logged out',
        Status: row.status.join(', ') || 'No flags',
      };
    }

    return {
      Employee: row.employee,
      'Employee ID': row.userId,
      Date: row.date,
      Location: row.location,
      'First in': formatTime(row.firstIn),
      'Last out': row.lastOut ? formatTime(row.lastOut) : 'In office',
      'Recorded time': row.recordedTime,
      Status: row.status.join(', ') || 'No flags',
    };
  });
}

export function downloadAttendanceExcel(rows, filename, options) {
  const worksheet = XLSX.utils.json_to_sheet(buildAttendanceExportRows(rows, options));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
