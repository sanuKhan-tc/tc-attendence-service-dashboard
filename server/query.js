function deviceMapSql(devices) {
  return devices
    .map(({ mid, location, lateCutoff, officeEnd }) =>
      `(${mid}, N'${location.replaceAll("'", "''")}', CONVERT(time, N'${lateCutoff}:00'), CONVERT(time, N'${officeEnd}:00'))`)
    .join(',\n    ');
}

function punchValuesSql() {
  return Array.from({ length: 12 }, (_, index) => `        (a.P${index + 1}MID, a.Punch${index + 1}, ${index + 1})`).join(',\n');
}

function devicePresenceFilterSql(mids) {
  return Array.from({ length: 12 }, (_, index) => `a.P${index + 1}MID IN (${mids})`).join(' OR ');
}

function buildScopedAttendanceQuery(devices, dateFilter, userFilter = '', { paginated = false } = {}) {
  const mids = devices.map(({ mid }) => mid).join(', ');
  const punchValues = punchValuesSql();
  const deviceFilter = devicePresenceFilterSql(mids);

  const finalSelect = paginated ? `, GroupedRows AS (
  SELECT
    r.userId,
    MAX(r.employee) AS employee,
    MAX(r.location) AS location,
    MIN(r.firstIn) AS firstIn,
    MAX(r.lastEvent) AS lastEvent,
    SUM(r.late) AS lateCount,
    SUM(r.early) AS earlyCount,
    SUM(r.underEight) AS underEightCount
  FROM ResolvedRows AS r
  WHERE (@location = N'All' OR r.location = @location OR (@location = N'India' AND r.location LIKE N'India%'))
    AND (@search = N'' OR r.employee LIKE N'%' + @search + N'%' OR r.userId LIKE N'%' + @search + N'%')
  GROUP BY r.userId
)
SELECT
  g.userId,
  g.employee,
  g.location,
  g.firstIn,
  g.lastEvent,
  g.lateCount,
  g.earlyCount,
  g.underEightCount,
  COUNT(*) OVER() AS totalCount,
  SUM(CASE WHEN g.lateCount > 0 THEN 1 ELSE 0 END) OVER() AS totalLate,
  SUM(CASE WHEN g.earlyCount > 0 THEN 1 ELSE 0 END) OVER() AS totalEarly,
  SUM(CASE WHEN g.underEightCount > 0 THEN 1 ELSE 0 END) OVER() AS totalUnderEight
FROM GroupedRows AS g
WHERE (
  (@tab = N'all' AND (g.lateCount > 0 OR g.earlyCount > 0 OR g.underEightCount > 0))
  OR (@tab = N'late' AND g.lateCount > 0)
  OR (@tab = N'early' AND g.earlyCount > 0)
  OR (@tab = N'underEight' AND g.underEightCount > 0)
)
ORDER BY g.lateCount DESC, g.earlyCount DESC, g.employee, g.userId
OFFSET @pageOffset ROWS FETCH NEXT @pageSize ROWS ONLY
OPTION (RECOMPILE);` : `
SELECT
  r.userId,
  r.employee,
  r.location,
  r.firstIn,
  r.lastEvent,
  r.workTime
FROM ResolvedRows AS r
ORDER BY r.firstIn, r.userId;`;

  return `
WITH DeviceMap (MID, Location, LateCutoff, OfficeEnd) AS (
  SELECT * FROM (VALUES
    ${deviceMapSql(devices)}
  ) AS Devices(MID, Location, LateCutoff, OfficeEnd)
), AttendanceRows AS (
  SELECT
    a.UserID,
    a.PDate,
    a.WorkTime,
    a.P1MID, a.Punch1,
    a.P2MID, a.Punch2,
    a.P3MID, a.Punch3,
    a.P4MID, a.Punch4,
    a.P5MID, a.Punch5,
    a.P6MID, a.Punch6,
    a.P7MID, a.Punch7,
    a.P8MID, a.Punch8,
    a.P9MID, a.Punch9,
    a.P10MID, a.Punch10,
    a.P11MID, a.Punch11,
    a.P12MID, a.Punch12
  FROM dbo.Mx_DATDTrn AS a
  WHERE ${dateFilter}
    ${userFilter}
    AND (${deviceFilter})
), ResolvedRows AS (
  SELECT
    a.UserID AS userId,
    COALESCE(u.Name, u.FullName, a.UserID) AS employee,
    m.Location AS location,
    punches.FirstIn AS firstIn,
    CASE WHEN punches.EventCount > 1 THEN punches.LastEvent END AS lastEvent,
    a.WorkTime AS workTime,
    CASE WHEN CONVERT(time, punches.FirstIn) > m.LateCutoff THEN 1 ELSE 0 END AS late,
    CASE WHEN punches.EventCount > 1 AND CONVERT(time, punches.LastEvent) < m.OfficeEnd THEN 1 ELSE 0 END AS early,
    CASE WHEN punches.EventCount > 1 AND COALESCE(a.WorkTime, DATEDIFF(minute, punches.FirstIn, punches.LastEvent)) < 480 THEN 1 ELSE 0 END AS underEight
  FROM AttendanceRows AS a
  CROSS APPLY (
    SELECT
      MIN(p.PunchTime) AS FirstIn,
      MAX(p.PunchTime) AS LastEvent,
      COUNT_BIG(*) AS EventCount,
      MAX(CASE WHEN p.rn = 1 THEN p.MID END) AS FirstMID,
      MAX(CASE WHEN p.lastRn = 1 THEN p.MID END) AS LastMID
    FROM (
      SELECT
        v.MID,
        v.PunchTime,
        ROW_NUMBER() OVER (ORDER BY v.PunchTime, v.PunchNo) AS rn
        ,ROW_NUMBER() OVER (ORDER BY v.PunchTime DESC, v.PunchNo DESC) AS lastRn
      FROM (VALUES
${punchValues}
      ) AS v(MID, PunchTime, PunchNo)
      WHERE v.MID IN (${mids})
        AND v.PunchTime IS NOT NULL
    ) AS p
  ) AS punches
  INNER JOIN DeviceMap AS m ON m.MID = punches.FirstMID
  LEFT JOIN dbo.Mx_UserMst AS u ON u.UserID = a.UserID
  WHERE punches.FirstIn IS NOT NULL
)${finalSelect}`;
}

export function buildAttendanceQuery(devices) {
  return buildScopedAttendanceQuery(
    devices,
    'a.PDate >= CONVERT(date, @startDate) AND a.PDate < DATEADD(day, 1, CONVERT(date, @endDate))',
    '',
    { paginated: true },
  );
}

export function buildAttendanceHistoryQuery(devices) {
  return buildScopedAttendanceQuery(
    devices,
    'a.PDate >= CONVERT(date, @fromDate) AND a.PDate < DATEADD(day, 1, CONVERT(date, @toDate))',
    'AND a.UserID = @userId',
  );
}

export function buildLatestAttendanceDateQuery(devices) {
  const mids = devices.map(({ mid }) => mid).join(', ');
  const punchColumns = Array.from({ length: 12 }, (_, index) => `P${index + 1}MID IN (${mids})`).join(' OR ');

  return `
SELECT CONVERT(char(10), MAX(PDate), 23) AS latestDate
FROM dbo.Mx_DATDTrn
WHERE ${punchColumns};`;
}

export function buildAttendanceUsersQuery() {
  return `
SELECT
  UserID AS userId,
  COALESCE(Name, FullName, UserID) AS employee
FROM dbo.Mx_UserMst
WHERE UserID IS NOT NULL
ORDER BY employee, userId;`;
}
