import dotenv from 'dotenv';
import { BIOMETRIC_DEVICES } from './attendance.js';
import { buildAttendanceHistoryQuery, buildAttendanceQuery, buildAttendanceUsersQuery, buildLatestAttendanceDateQuery } from './query.js';

dotenv.config();
const { default: sql } = process.env.DB_DRIVER === 'tedious'
  ? await import('mssql')
  : await import('mssql/msnodesqlv8.js');

const ATTENDANCE_QUERY = buildAttendanceQuery(BIOMETRIC_DEVICES);
const ATTENDANCE_HISTORY_QUERY = buildAttendanceHistoryQuery(BIOMETRIC_DEVICES);
const LATEST_DATE_QUERY = buildLatestAttendanceDateQuery(BIOMETRIC_DEVICES);
const ATTENDANCE_USERS_QUERY = buildAttendanceUsersQuery();

let poolPromise = null;

function config() {
  const poolOptions = {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: Number(process.env.DB_POOL_MIN || 1),
    idleTimeoutMillis: 30000,
  };

  if (process.env.DB_DRIVER === 'tedious') {
    const serverValue = (process.env.DB_SERVER || 'localhost').replace(/^tcp:/i, '');
    const [server, portValue] = serverValue.split(',');
    return {
      server,
      port: Number(portValue || 1433),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE || 'COSEC',
      requestTimeout: 30000,
      connectionTimeout: 30000,
      pool: poolOptions,
      options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,
      },
    };
  }

  return {
    connectionString: process.env.DB_CONNECTION_STRING
      || `Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_DATABASE || 'COSEC'};Trusted_Connection=Yes;TrustServerCertificate=Yes;`,
    requestTimeout: 30000,
    pool: poolOptions,
  };
}

function getPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(config());
    pool.on('error', () => {
      poolPromise = null;
    });
    poolPromise = pool.connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

export async function closePool() {
  if (!poolPromise) return;
  const activePromise = poolPromise;
  poolPromise = null;
  try {
    const pool = await activePromise;
    await pool.close();
  } catch {
    // Ignore close errors during shutdown
  }
}

function createAbortError() {
  const error = new Error('Query aborted');
  error.name = 'AbortError';
  return error;
}

async function executeQuery(queryText, bindInputs, signal) {
  if (signal?.aborted) throw createAbortError();
  const pool = await getPool();
  if (signal?.aborted) throw createAbortError();

  const request = pool.request();
  if (bindInputs) bindInputs(request);

  const onAbort = () => {
    try {
      request.cancel();
    } catch {
      // Driver may throw if request already completed
    }
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const result = await request.query(queryText);
    return result.recordset;
  } catch (error) {
    if (signal?.aborted) throw createAbortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function fetchAttendanceRows(
  startDate,
  endDate,
  { page = 1, pageSize = 10, location = 'All', search = '', tab = 'all', signal } = {},
) {
  const recordset = await executeQuery(
    ATTENDANCE_QUERY,
    (request) => {
      request
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .input('pageOffset', sql.Int, (page - 1) * pageSize)
        .input('pageSize', sql.Int, pageSize)
        .input('location', sql.NVarChar(20), location)
        .input('search', sql.NVarChar(100), search)
        .input('tab', sql.NVarChar(20), tab);
    },
    signal,
  );

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
}

export async function fetchLatestAttendanceDate(signal) {
  const recordset = await executeQuery(LATEST_DATE_QUERY, null, signal);
  return recordset[0]?.latestDate || null;
}

export async function fetchAttendanceHistoryRows(userId, fromDate, toDate, signal) {
  return executeQuery(
    ATTENDANCE_HISTORY_QUERY,
    (request) => {
      request
        .input('userId', sql.VarChar(50), userId)
        .input('fromDate', sql.Date, fromDate)
        .input('toDate', sql.Date, toDate);
    },
    signal,
  );
}

export async function fetchAttendanceUsers(signal) {
  return executeQuery(ATTENDANCE_USERS_QUERY, null, signal);
}
