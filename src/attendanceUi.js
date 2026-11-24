export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatDurationBetween(first, last) {
  if (!first || !last) return '—';
  const minutes = Math.round((new Date(last).getTime() - new Date(first).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function isOverviewMetricFlagged(row, metric, isDateRange) {
  if (isDateRange) return false;
  if (metric === 'firstIn') return Boolean(row.late);
  if (metric === 'lastOut') return Boolean(row.early);
  return metric === 'totalHours' && Boolean(row.underEight);
}

export function isOverviewRowCritical(row, isDateRange) {
  return !isDateRange && Boolean(row.late && row.early && row.underEight);
}

export function formatAccessSource(firstInSource, lastOutSource) {
  return `In: ${firstInSource || '—'} · Out: ${lastOutSource || '—'}`;
}

export function accessSourceKind(source) {
  if (String(source || '').toLowerCase() === 'door access') return 'door-access';
  if (String(source || '').toLowerCase() === 'face id') return 'face-id';
  return 'unknown';
}

export function presentDaysLabel(rows) {
  return rows.length ? String(rows.length) : 'No records';
}

export function dataSourceLabel(value) {
  return String(value).toLowerCase() === 'true' ? 'Live data' : 'Local backup data';
}

export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'Latest available';
  if (startDate === endDate || !endDate) return startDate;
  return `${startDate} – ${endDate}`;
}

function formatLocalDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function getOverviewDateRange(preset, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === 'latest') return { startDate: '', endDate: '' };
  if (preset === 'today') return { startDate: formatLocalDate(end), endDate: formatLocalDate(end) };

  if (preset === 'yesterday') {
    end.setDate(end.getDate() - 1);
    return { startDate: formatLocalDate(end), endDate: formatLocalDate(end) };
  }

  if (preset === 'week') {
    const start = new Date(end);
    start.setDate(start.getDate() - start.getDay());
    return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
  }

  const monthsBack = preset === 'last-3-months' ? 2 : preset === 'last-6-months' ? 5 : 0;
  const start = new Date(end.getFullYear(), end.getMonth() - monthsBack, 1);
  return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
}

export function isTodayDateRange(startDate, endDate, today = new Date()) {
  const todayDate = getOverviewDateRange('today', today).startDate;
  return startDate === todayDate && endDate === todayDate;
}

export function formatTableDateRange(startDate, endDate) {
  const formatTableDate = (value) => {
    if (!value) return 'Latest available';
    const [year, month, day] = value.split('-').map(Number);
    const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
    return `${String(day).padStart(2, '0')}/${monthName}`;
  };

  if (!endDate || startDate === endDate) return formatTableDate(startDate || endDate);
  return `${formatTableDate(startDate)} – ${formatTableDate(endDate)}`;
}

export function filterAttendanceRows(rows, { location, search, tab }) {
  const query = search.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesLocation = location === 'All'
      || row.location === location
      || (location === 'India' && row.location?.startsWith('India'));
    const matchesSearch = !query || `${row.employee} ${row.userId}`.toLowerCase().includes(query);
    const matchesTab = tab === 'all'
      || (tab === 'late' && row.late)
      || (tab === 'early' && row.early)
      || (tab === 'underEight' && row.underEight);

    return matchesLocation && matchesSearch && matchesTab;
  });
}

export function paginateRows(rows, page, pageSize = 10) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    page: currentPage,
    pageSize,
    total,
    totalPages,
  };
}

export function buildHistoryChartData(rows) {
  return rows.map((row) => ({
    date: row.date,
    minutes: row.recordedMinutes ?? 0,
    late: row.late,
    early: row.early,
    underEight: row.underEight,
  }));
}

export function buildCalendarWeeks(rows, month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const startOffset = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const rowByDate = new Map(rows.map((row) => [row.date, row]));
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => {
    const day = index - startOffset + 1;
    if (day < 1 || day > daysInMonth) return { date: null, row: null };
    const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { date, row: rowByDate.get(date) || null };
  });

  return Array.from({ length: cellCount / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function filterEmployeeOptions(options, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;

  return options.filter((user) =>
    `${user.employee} ${user.userId} ${user.location ?? ''}`.toLowerCase().includes(normalized),
  );
}
