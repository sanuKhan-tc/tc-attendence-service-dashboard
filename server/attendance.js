const MINUTES_PER_DAY = 24 * 60;

export const BIOMETRIC_DEVICES = [
  { mid: 15, name: 'TA-tc Dubai-Device-1', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00' },
  { mid: 5, name: 'Main Door -114', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00', fallbackFor: 15 },
  { mid: 6, name: 'Main Door-113', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00', fallbackFor: 15 },
  { mid: 7, name: 'Main Door-214', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00', fallbackFor: 15 },
  { mid: 9, name: 'Main Door -116', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00', fallbackFor: 15 },
  { mid: 1, name: 'Panel200-Device-1', location: 'Dubai', lateCutoff: '08:30', officeEnd: '17:00', fallbackFor: 15 },
  { mid: 12, name: 'TC-Hyderabad', location: 'India - Hyderabad', lateCutoff: '10:00', officeEnd: '18:30' },
  { mid: 13, name: 'TC-Noida', location: 'India - Noida', lateCutoff: '10:00', officeEnd: '18:30' },
  { mid: 16, name: 'TC- Chennai', location: 'India - Chennai', lateCutoff: '10:30', officeEnd: '19:00' },
  { mid: 14, name: 'techcarrot-Cafeteria', location: 'India', lateCutoff: '10:00', officeEnd: '18:30' },
];

export const ALLOWED_LOCATIONS = [
  'All',
  'Dubai',
  'India',
  ...new Set(BIOMETRIC_DEVICES.map((device) => device.location).filter((location) => location !== 'Dubai' && location !== 'India')),
];

const deviceRules = new Map(BIOMETRIC_DEVICES.map((device) => [device.location, device]));
const defaultIndiaRule = BIOMETRIC_DEVICES.find((device) => device.location.startsWith('India'));

function dateValue(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(`${value}Z`);
  return new Date(value);
}

function minutesOfDay(value) {
  const date = dateValue(value);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function cutoffMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesBetween(first, last) {
  const difference = Math.round((dateValue(last).getTime() - dateValue(first).getTime()) / 60000);
  return difference >= 0 && difference < MINUTES_PER_DAY ? difference : null;
}

function formatMinutes(value) {
  if (value == null) return '—';
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}m`;
}

function normalizeRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const firstIn = dateValue(row.firstIn ?? row.eventTime);
    const key = `${row.userId}|${firstIn.toISOString().slice(0, 10)}`;
    const current = grouped.get(key);
    if (!current) {
      const initialLastEvent = row.lastEventTime ?? row.lastEvent ?? row.eventTime;
      grouped.set(key, {
        ...row,
        firstIn,
        firstInSource: row.firstInSource ?? null,
        lastEvent: initialLastEvent ? dateValue(initialLastEvent) : null,
        lastOutSource: row.lastOutSource ?? null,
      });
      continue;
    }

    if (firstIn < current.firstIn) {
      current.firstIn = firstIn;
      current.location = row.location;
      current.deviceName = row.deviceName;
      current.firstInSource = row.firstInSource ?? null;
    }
    const rowLastEvent = row.lastEventTime ?? row.lastEvent ?? row.eventTime;
    if (rowLastEvent && (!current.lastEvent || dateValue(rowLastEvent) > current.lastEvent)) {
      current.lastEvent = dateValue(rowLastEvent);
      current.lastOutSource = row.lastOutSource ?? null;
    }
    if (row.workTime != null) current.workTime = row.workTime;
    if (row.netWorkTime != null) current.netWorkTime = row.netWorkTime;
    if (row.lateIn != null) current.lateIn = row.lateIn;
    if (row.earlyOut != null) current.earlyOut = row.earlyOut;
  }

  return [...grouped.values()];
}

export function buildAttendanceReport(rows) {
  const reportRows = normalizeRows(rows).map((row) => {
    const rule = deviceRules.get(row.location)
      ?? BIOMETRIC_DEVICES.find((device) => device.name === row.deviceName)
      ?? (row.location?.startsWith('India') ? defaultIndiaRule : null)
      ?? BIOMETRIC_DEVICES[0];
    const firstIn = row.firstIn;
    const lastOut = row.lastEvent && row.lastEvent.getTime() > firstIn.getTime() ? row.lastEvent : null;
    const calculatedMinutes = lastOut ? minutesBetween(firstIn, lastOut) : null;
    const recordedMinutes = lastOut ? (row.workTime ?? calculatedMinutes) : null;
    const late = minutesOfDay(firstIn) > cutoffMinutes(rule.lateCutoff);
    const early = lastOut != null && minutesOfDay(lastOut) < cutoffMinutes(rule.officeEnd);
    const underEight = lastOut != null && recordedMinutes != null && recordedMinutes < 480;

    return {
      userId: row.userId,
      employee: row.employee || row.fullName || row.userId,
      location: row.location,
      date: firstIn.toISOString().slice(0, 10),
      firstIn: firstIn.toISOString(),
      firstInSource: row.firstInSource,
      lastOut: lastOut?.toISOString() ?? null,
      lastOutSource: lastOut ? row.lastOutSource : null,
      lastOutLabel: lastOut ? lastOut.toISOString() : 'In office',
      recordedMinutes,
      recordedTime: formatMinutes(recordedMinutes),
      late,
      early,
      underEight,
      status: [
        late ? 'Late arrival' : null,
        early ? 'Early checkout' : null,
        underEight ? 'Under 8 hours' : null,
      ].filter(Boolean),
    };
  }).sort((a, b) => a.firstIn.localeCompare(b.firstIn));

  return {
    rows: reportRows,
    summary: {
      late: reportRows.filter((row) => row.late).length,
      early: reportRows.filter((row) => row.early).length,
      underEight: reportRows.filter((row) => row.underEight).length,
    },
  };
}

export function buildConsolidatedReport(rows) {
  const reportRows = rows.map((row) => {
    const lateCount = Number(row.lateCount || 0);
    const earlyCount = Number(row.earlyCount || 0);
    const underEightCount = Number(row.underEightCount || 0);
    const late = lateCount > 0;
    const early = earlyCount > 0;
    const underEight = underEightCount > 0;
    const firstIn = row.firstIn ? dateValue(row.firstIn) : null;
    const lastEvent = row.lastEvent ? dateValue(row.lastEvent) : null;
    const lastOut = firstIn && lastEvent && lastEvent.getTime() > firstIn.getTime() ? lastEvent : null;

    return {
      userId: row.userId,
      employee: row.employee || row.fullName || row.userId,
      location: row.location,
      firstIn: firstIn?.toISOString() ?? null,
      firstInSource: row.firstInSource ?? null,
      lastOut: lastOut?.toISOString() ?? null,
      lastOutSource: lastOut ? (row.lastOutSource ?? null) : null,
      lateCount,
      earlyCount,
      underEightCount,
      late,
      early,
      underEight,
      status: [
        late ? 'Late arrival' : null,
        early ? 'Early checkout' : null,
        underEight ? 'Under 8 hours' : null,
      ].filter(Boolean),
    };
  });

  return {
    rows: reportRows,
    summary: {
      late: reportRows.filter((row) => row.late).length,
      early: reportRows.filter((row) => row.early).length,
      underEight: reportRows.filter((row) => row.underEight).length,
    },
  };
}

export function toClientReport(rows) {
  return buildAttendanceReport(rows);
}
