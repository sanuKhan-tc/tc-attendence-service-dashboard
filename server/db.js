import dotenv from 'dotenv';
import sql from 'mssql/msnodesqlv8.js';
import { BIOMETRIC_DEVICES } from './attendance.js';
import { buildAttendanceHistoryQuery, buildAttendanceQuery, buildAttendanceUsersQuery, buildLatestAttendanceDateQuery } from './query.js';

dotenv.config();

function config() {
  return {
    connectionString: process.env.DB_CONNECTION_STRING
      || `Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_DATABASE || 'COSEC'};Trusted_Connection=Yes;TrustServerCertificate=Yes;`,
    requestTimeout: 30000,
  };
}

export async function fetchAttendanceRows(date, { page = 1, pageSize = 10, location = 'All', search = '', tab = 'all' } = {}) {
  const pool = await sql.connect(config());
  try {
    const recordset = (await pool.request()
      .input('attendanceDate', sql.Date, date)
      .input('pageOffset', sql.Int, (page - 1) * pageSize)
      .input('pageSize', sql.Int, pageSize)
      .input('location', sql.NVarChar(20), location)
      .input('search', sql.NVarChar(100), search)
      .input('tab', sql.NVarChar(20), tab)
      .query(buildAttendanceQuery(BIOMETRIC_DEVICES))).recordset;
    const first = recordset[0];
    return {
      rows: recordset,
      total: Number(first?.totalCount || 0),
      summary: {
        late: Number(first?.totalLate || 0),
        early: Number(first?.totalEarly || 0),
        underEight: Number(first?.totalUnderEight || 0),
      },
    };
  } finally {
    await pool.close();
  }
}

export async function fetchLatestAttendanceDate() {
  const pool = await sql.connect(config());
  try {
    return (await pool.request().query(buildLatestAttendanceDateQuery(BIOMETRIC_DEVICES))).recordset[0]?.latestDate || null;
  } finally {
    await pool.close();
  }
}

export async function fetchAttendanceHistoryRows(userId, fromDate, toDate) {
  const pool = await sql.connect(config());
  try {
    return (await pool.request()
      .input('userId', sql.VarChar(50), userId)
      .input('fromDate', sql.Date, fromDate)
      .input('toDate', sql.Date, toDate)
      .query(buildAttendanceHistoryQuery(BIOMETRIC_DEVICES))).recordset;
  } finally {
    await pool.close();
  }
}

export async function fetchAttendanceUsers() {
  const pool = await sql.connect(config());
  try {
    return (await pool.request().query(buildAttendanceUsersQuery())).recordset;
  } finally {
    await pool.close();
  }
}
