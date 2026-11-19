import * as XLSX from 'xlsx';
import { formatTime } from './attendanceUi.js';

export function buildAttendanceExportRows(rows) {
  return rows.map((row) => ({
    Employee: row.employee,
    'Employee ID': row.userId,
    Date: row.date,
    Location: row.location,
    'First in': formatTime(row.firstIn),
    'Last out': row.lastOut ? formatTime(row.lastOut) : 'In office',
    'Recorded time': row.recordedTime,
    Status: row.status.join(', ') || 'No flags',
  }));
}

export function downloadAttendanceExcel(rows, filename) {
  const worksheet = XLSX.utils.json_to_sheet(buildAttendanceExportRows(rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
