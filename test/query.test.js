import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMETRIC_DEVICES } from '../server/attendance.js';
import { buildAttendanceHistoryQuery, buildAttendanceQuery, buildAttendanceUsersQuery, buildLatestAttendanceDateQuery } from '../server/query.js';

test('builds a read-only biometric attendance query for the hard-coded devices', () => {
  const query = buildAttendanceQuery(BIOMETRIC_DEVICES);
  const normalized = query.replace(/\s+/g, ' ').trim().toUpperCase();

  assert.match(normalized, /^WITH/);
  assert.match(normalized, /FROM DBO\.MX_DATDTRN/);
  assert.match(normalized, /P1MID/);
  assert.match(normalized, /@STARTDATE/);
  assert.match(normalized, /@ENDDATE/);
  assert.match(normalized, /OFFSET @PAGEOFFSET ROWS FETCH NEXT @PAGESIZE ROWS ONLY/);
  assert.match(normalized, /COUNT\(\*\) OVER\(\)/);
  assert.match(normalized, /SUM\(CASE WHEN G\.LATECOUNT > 0 THEN 1 ELSE 0 END\) OVER\(\) AS TOTALLATE/);
  assert.match(normalized, /GROUP BY R\.USERID/);
  assert.match(normalized, /G\.LATECOUNT > 0 OR G\.EARLYCOUNT > 0 OR G\.UNDEREIGHTCOUNT > 0/);
  assert.match(normalized, /ORDER BY G\.LATECOUNT DESC, G\.EARLYCOUNT DESC/);
  assert.match(normalized, /@LOCATION = N'INDIA' AND R\.LOCATION LIKE N'INDIA%'/);
  assert.match(normalized, /CONVERT\(TIME, PUNCHES\.FIRSTIN\) > M\.LATECUTOFF/);
  assert.match(normalized, /CONVERT\(TIME, PUNCHES\.LASTEVENT\) < M\.OFFICEEND/);
  assert.match(normalized, /DEVICEMAP \(MID, LOCATION, LATECUTOFF, OFFICEEND\)/);
  assert.doesNotMatch(normalized, /ACCESSTYPE|FIRSTINSOURCE|LASTOUTSOURCE|DOOR ACCESS|FALLBACK/);
  for (const device of BIOMETRIC_DEVICES) assert.match(normalized, new RegExp(`\\(${device.mid},`));
  assert.doesNotMatch(normalized, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/);
});

test('builds a read-only latest-date query for the biometric punch columns', () => {
  const query = buildLatestAttendanceDateQuery(BIOMETRIC_DEVICES).replace(/\s+/g, ' ').trim().toUpperCase();

  assert.match(query, /^SELECT CONVERT\(CHAR\(10\), MAX\(PDATE\), 23\)/);
  assert.match(query, /FROM DBO\.MX_DATDTRN/);
  for (let index = 1; index <= 12; index += 1) assert.match(query, new RegExp(`P${index}MID IN`));
  assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/);
});

test('builds a narrow user history query over a selected date range', () => {
  const query = buildAttendanceHistoryQuery(BIOMETRIC_DEVICES).replace(/\s+/g, ' ').trim().toUpperCase();

  assert.match(query, /FROM DBO\.MX_DATDTRN/);
  assert.match(query, /@FROMDATE/);
  assert.match(query, /@TODATE/);
  assert.match(query, /A\.USERID = @USERID/);
  assert.doesNotMatch(query, /NETWORKTIME|LATEIN|EARLYOUT|SCHSTAT/);
  assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/);
});

test('builds a narrow read-only employee selector query', () => {
  const query = buildAttendanceUsersQuery().replace(/\s+/g, ' ').trim().toUpperCase();

  assert.match(query, /^SELECT USERID AS USERID/);
  assert.match(query, /FROM DBO\.MX_USERMST/);
  assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE)\b/);
});
