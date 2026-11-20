export async function fetchAllAttendanceRows(fetchImpl, { startDate, endDate, location, search, tab }) {
  const pageSize = 100;
  const fetchPage = async (page) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      location,
      search,
      tab,
    });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    const response = await fetchImpl(`/api/attendance?${params.toString()}`);
    if (!response.ok) throw new Error('Unable to load attendance for export');
    return response.json();
  };

  const firstPage = await fetchPage(1);
  const totalPages = Math.max(1, firstPage.pagination?.totalPages || 1);
  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2)),
  );

  return [firstPage, ...remainingPages].flatMap((report) => report.rows || []);
}
