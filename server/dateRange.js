const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveAttendanceDateRange(startDate, endDate, fallbackDate) {
  const requestedStart = String(startDate || '').trim();
  const requestedEnd = String(endDate || '').trim();
  const fallback = String(fallbackDate || '').trim();
  const resolvedStart = requestedStart || requestedEnd || fallback;
  const resolvedEnd = requestedEnd || requestedStart || fallback;

  if (!DATE_PATTERN.test(resolvedStart) || !DATE_PATTERN.test(resolvedEnd)) {
    throw new RangeError('startDate and endDate must use YYYY-MM-DD.');
  }
  if (resolvedStart > resolvedEnd) {
    throw new RangeError('startDate must be before or equal to endDate.');
  }

  return { startDate: resolvedStart, endDate: resolvedEnd };
}
