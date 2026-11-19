export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
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

export function filterAttendanceRows(rows, { location, search, tab }) {
  const query = search.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesLocation = location === 'All' || row.location === location;
    const matchesSearch = !query || `${row.employee} ${row.userId}`.toLowerCase().includes(query);
    const matchesTab = tab === 'all'
      || (tab === 'late' && row.late)
      || (tab === 'early' && row.early)
      || (tab === 'underEight' && row.underEight);

    return matchesLocation && matchesSearch && matchesTab;
  });
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
