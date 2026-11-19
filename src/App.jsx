import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCalendarWeeks,
  buildHistoryChartData,
  dataSourceLabel,
  filterAttendanceRows,
  filterEmployeeOptions,
  formatTime,
  presentDaysLabel,
} from './attendanceUi.js';
import { downloadAttendanceExcel } from './excelExport.js';

const LOCATIONS = ['All', 'Dubai', 'India'];
const TABS = [
  { id: 'all', label: 'All flagged' },
  { id: 'late', label: 'Late arrivals' },
  { id: 'early', label: 'Early leavers' },
  { id: 'underEight', label: 'Under 8 hours' },
];
const SKELETON_BAR_HEIGHTS = [72, 86, 54, 92, 68, 45, 80, 76, 62, 88];
const DATA_SOURCE_LABEL = dataSourceLabel(import.meta.env.VITE_LIVE_DATA_ENABLED);

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function statusLabel(status) {
  return status === 'Early checkout' ? 'Early checkout · provisional' : status;
}

function statusClassName(status) {
  if (status === 'Late arrival') return 'status late-status';
  if (status === 'Under 8 hours') return 'status under-status';
  return 'status early-status';
}

function formatEmployeeLabel(user) {
  return `${user.employee} · ${user.userId}`;
}

function Spinner({ light = false, size = 15 }) {
  return (
    <span
      className={light ? 'spinner spinner-light' : 'spinner'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

function LateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function EarlyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function HoursIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}

function DaysIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={open ? 'chevron-icon open' : 'chevron-icon'}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Navigation({ page, dataSource }) {
  return (
    <header className="top-header">
      <div className="brand-bar" aria-hidden="true" />
      <nav className="top-nav" aria-label="Main navigation">
        <a className="brand" href="#dashboard">
          <img
            className="brand-logo"
            src="/techcarrot-logo.svg"
            alt="techcarrot"
            width="136"
            height="34"
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-portal">Attendance</span>
        </a>
        <div className="nav-links">
          <a className={page === 'dashboard' ? 'nav-link active' : 'nav-link'} href="#dashboard">Overview</a>
          <a className={page === 'user-report' ? 'nav-link active' : 'nav-link'} href="#user-report">User reports</a>
        </div>
        <span className="nav-scope">
          <span className="status-dot" aria-hidden="true" />
          {dataSource}
        </span>
      </nav>
    </header>
  );
}

function SummaryCardsSkeleton() {
  return (
    <section className="summary-grid" aria-label="Loading attendance summary" aria-busy="true">
      {['late-card', 'early-card', 'hours-card'].map((variant) => (
        <article className={`summary-card skeleton-card ${variant}`} key={variant}>
          <div className="summary-heading">
            <span className="skeleton skeleton-icon" />
            <span className="skeleton skeleton-line w-110" />
          </div>
          <span className="skeleton skeleton-kpi" />
          <span className="skeleton skeleton-line w-180" />
        </article>
      ))}
    </section>
  );
}

function TableRowsSkeleton({ rows = 6, showEmployee = true }) {
  return Array.from({ length: rows }, (_, index) => (
    <tr className="skeleton-row" key={index} aria-hidden="true">
      <td>
        {showEmployee ? (
          <div className="employee-cell">
            <span className="skeleton skeleton-avatar" />
            <div className="skeleton-stack">
              <span className="skeleton skeleton-line w-130" />
              <span className="skeleton skeleton-line w-70" />
            </div>
          </div>
        ) : (
          <span className="skeleton skeleton-line w-90" />
        )}
      </td>
      <td><span className="skeleton skeleton-pill w-64" /></td>
      <td><span className="skeleton skeleton-line w-56" /></td>
      <td><span className="skeleton skeleton-line w-56" /></td>
      <td><span className="skeleton skeleton-line w-64" /></td>
      <td><span className="skeleton skeleton-pill w-110" /></td>
    </tr>
  ));
}

function ChartsSkeleton() {
  return (
    <div className="charts-grid" aria-label="Loading attendance charts" aria-busy="true">
      <article className="chart-card">
        <div className="chart-heading">
          <span className="skeleton skeleton-line w-140" />
          <span className="skeleton skeleton-line w-56" />
        </div>
        <div className="bar-chart">
          {SKELETON_BAR_HEIGHTS.map((height, index) => (
            <div className="bar-column" key={index}>
              <div className="bar-track">
                <span className="skeleton skeleton-bar" style={{ height: `${height}%` }} />
              </div>
              <span className="skeleton skeleton-line w-24" />
            </div>
          ))}
        </div>
      </article>
      <article className="chart-card">
        <div className="chart-heading">
          <span className="skeleton skeleton-line w-110" />
          <span className="skeleton skeleton-line w-56" />
        </div>
        <div className="metric-bars">
          {[78, 52, 64].map((width, index) => (
            <div className="metric-row" key={index}>
              <div>
                <span className="skeleton skeleton-line w-110" />
                <span className="skeleton skeleton-line w-24" />
              </div>
              <div className="metric-track">
                <span className="skeleton skeleton-metric-fill" style={{ width: `${width}%` }} />
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function SummaryCards({ summary, presentDaysRows }) {
  return (
    <section className={presentDaysRows === undefined ? 'summary-grid' : 'summary-grid summary-grid-four'} aria-label="Attendance summary">
      <article className="summary-card late-card">
        <div className="summary-heading">
          <span className="summary-icon"><LateIcon /></span>
          <span>Late arrivals</span>
        </div>
        <strong>{summary.late}</strong>
        <small>Dubai after 08:30 · India after 09:30</small>
      </article>
      <article className="summary-card early-card">
        <div className="summary-heading">
          <span className="summary-icon"><EarlyIcon /></span>
          <span>Early leavers</span>
        </div>
        <strong>{summary.early}</strong>
        <small>Dubai before 17:00 · India before 18:00</small>
      </article>
      <article className="summary-card hours-card">
        <div className="summary-heading">
          <span className="summary-icon"><HoursIcon /></span>
          <span>Under 8 hours</span>
        </div>
        <strong>{summary.underEight || '—'}</strong>
        <small>{summary.underEight ? 'Completed biometric intervals' : 'Available for completed intervals'}</small>
      </article>
      {presentDaysRows !== undefined && (
        <article className="summary-card present-card">
          <div className="summary-heading">
            <span className="summary-icon"><DaysIcon /></span>
            <span>Days present</span>
          </div>
          <strong>{presentDaysLabel(presentDaysRows)}</strong>
          <small>Days with biometric attendance</small>
        </article>
      )}
    </section>
  );
}

function EmployeeCombobox({ options, selectedUserId, onSelect, loading }) {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const selectedUser = useMemo(
    () => options.find((user) => user.userId === selectedUserId) ?? null,
    [options, selectedUserId],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selectedUser ? formatEmployeeLabel(selectedUser) : '');
  }, [selectedUser]);

  const filteredOptions = useMemo(() => {
    if (selectedUser && query === formatEmployeeLabel(selectedUser)) {
      return options;
    }
    return filterEmployeeOptions(options, query);
  }, [options, query, selectedUser]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setQuery(selectedUser ? formatEmployeeLabel(selectedUser) : '');
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [selectedUser]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function selectOption(user) {
    onSelect(user.userId);
    setQuery(formatEmployeeLabel(user));
    setOpen(false);
  }

  function clearSelection() {
    onSelect('');
    setQuery('');
    setOpen(true);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (filteredOptions.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      }
    } else if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(selectedUser ? formatEmployeeLabel(selectedUser) : '');
    }
  }

  const activeOption = open && filteredOptions[activeIndex] ? filteredOptions[activeIndex] : null;

  return (
    <div className="combobox" ref={containerRef}>
      <div className={open ? 'combobox-input-wrap open' : 'combobox-input-wrap'}>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="employee-combobox-list"
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `employee-opt-${activeOption.userId}` : undefined}
          aria-label="Employee"
          placeholder={loading ? 'Loading employees…' : 'Search employee by name or ID'}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setOpen(true);
            if (!nextValue.trim()) {
              onSelect('');
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="combobox-actions">
          {!loading && (query || selectedUserId) && (
            <button
              type="button"
              className="combobox-clear"
              aria-label="Clear selected employee"
              onClick={clearSelection}
            >
              ×
            </button>
          )}
          {loading ? (
            <span className="combobox-loader" aria-label="Loading employees">
              <Spinner size={15} />
            </span>
          ) : (
            <button
              type="button"
              className="combobox-toggle"
              aria-label={open ? 'Close employee list' : 'Open employee list'}
              tabIndex={-1}
              onClick={() => setOpen((prev) => !prev)}
            >
              <ChevronIcon open={open} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="combobox-popover" id="employee-combobox-list" role="listbox" ref={listRef}>
          {loading ? (
            <div className="combobox-loading" aria-busy="true">
              <div className="combobox-loading-header">
                <Spinner size={13} />
                <span>Loading employees…</span>
              </div>
              {Array.from({ length: 4 }, (_, index) => (
                <div className="combobox-skeleton-item" key={index} aria-hidden="true">
                  <span className="skeleton skeleton-avatar sm" />
                  <div className="skeleton-stack">
                    <span className="skeleton skeleton-line w-130" />
                    <span className="skeleton skeleton-line w-70" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((user, index) => {
              const isSelected = user.userId === selectedUserId;
              const isActive = index === activeIndex;
              return (
                <button
                  key={user.userId}
                  id={`employee-opt-${user.userId}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  className={`combobox-option${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectOption(user);
                  }}
                >
                  <span className="avatar combobox-avatar">{initials(user.employee)}</span>
                  <span className="combobox-option-text">
                    <b>{user.employee}</b>
                    <small>{user.userId}</small>
                  </span>
                  {user.location && <span className="location-tag combobox-loc">{user.location}</span>}
                  {isSelected && <span className="combobox-check"><CheckIcon /></span>}
                </button>
              );
            })
          ) : (
            <div className="combobox-empty">No matching employees found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardPage({ date, setDate, location, setLocation, search, setSearch, tab, setTab, report, state, error, onSelectUser, resetFilters, pagination, setPage }) {
  const isLoading = state === 'loading';
  const visibleRows = useMemo(() => {
    const flaggedRows = report.rows.filter((row) => row.status.length > 0);
    return filterAttendanceRows(flaggedRows, { location, search, tab });
  }, [location, report.rows, search, tab]);

  return (
    <>
      <section className="page-hero" aria-label="Attendance overview header">
        <div>
          <span className="hero-eyebrow">Workforce Operations</span>
          <h1 className="hero-title">Biometric Attendance Overview</h1>
        </div>
        <div className="hero-meta">
          <span className="meta-pill">{location === 'All' ? 'Dubai & India' : location}</span>
          {date && <span className="meta-pill meta-date">{date}</span>}
        </div>
      </section>

      <section className="filter-card" aria-label="Attendance filters">
        <label>
          <span>Day</span>
          <div className={isLoading ? 'select-wrap is-loading' : 'select-wrap'}>
            <select value="Latest available" aria-label="Day" readOnly disabled={isLoading}>
              <option>Latest available</option>
            </select>
            {isLoading && <span className="field-loader" aria-hidden="true"><Spinner size={14} /></span>}
          </div>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>Location</span>
          <div className={isLoading ? 'select-wrap is-loading' : 'select-wrap'}>
            <select value={location} onChange={(event) => setLocation(event.target.value)} disabled={isLoading}>
              {LOCATIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
            {isLoading && <span className="field-loader" aria-hidden="true"><Spinner size={14} /></span>}
          </div>
        </label>
        <label className="employee-filter">
          <span>Employee</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or employee ID" />
        </label>
        <button className="reset-button" type="button" onClick={resetFilters}>Reset filters</button>
      </section>

      {isLoading ? <SummaryCardsSkeleton /> : <SummaryCards summary={report.summary} />}

      <section className="flagged-card">
        <div className="section-title"><h2>Flagged staff</h2><div className="section-actions"><span className="scope-note">Biometric attendance only</span><button className="reset-button" type="button" onClick={() => downloadAttendanceExcel(visibleRows, `attendance-${date || 'latest'}-page-${pagination.page}`)} disabled={state !== 'ready' || visibleRows.length === 0}>Export Excel</button></div></div>
        <div className="tabs" role="tablist" aria-label="Flagged staff filters">{TABS.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'tab active' : 'tab'} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Location</th><th>First in</th><th>Last out</th><th>Recorded time</th><th>Status</th></tr></thead><tbody>
          {isLoading && <TableRowsSkeleton rows={6} showEmployee />}
          {state === 'error' && <tr><td colSpan="6" className="table-message error-message">{error}</td></tr>}
          {state === 'ready' && visibleRows.map((row) => <tr key={`${row.userId}-${row.firstIn}`}>
            <td><button className="employee-cell employee-button" type="button" onClick={() => onSelectUser(row.userId)}><span className="avatar">{initials(row.employee)}</span><span><b>{row.employee}</b><small>{row.userId}</small></span></button></td>
            <td><span className="location-tag">{row.location}</span></td>
            <td className="num-cell">{formatTime(row.firstIn)}</td>
            <td className="num-cell">{row.lastOut ? formatTime(row.lastOut) : <span className="in-office">In office</span>}</td>
            <td className="num-cell">{row.recordedTime}</td>
            <td><div className="status-list">{row.status.map((status) => <span className={statusClassName(status)} key={status}>{statusLabel(status)}</span>)}</div></td>
          </tr>)}
          {state === 'ready' && visibleRows.length === 0 && <tr><td colSpan="6" className="table-message">No flagged biometric attendance for this selection.</td></tr>}
        </tbody></table></div>
        <footer className="table-footer">{isLoading ? <span>Loading biometric attendance records…</span> : <><span>Showing {visibleRows.length} flagged employees · {pagination.total} records · Page {pagination.page} of {pagination.totalPages}</span><span className="pagination-controls"><button type="button" onClick={() => setPage(pagination.page - 1)} disabled={pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</button></span></>}</footer>
      </section>
    </>
  );
}

function HistoryCharts({ rows }) {
  const chartData = buildHistoryChartData(rows);
  const maxMinutes = Math.max(480, ...chartData.map((item) => item.minutes), 1);
  const statusTotal = chartData.length || 1;
  const metrics = [
    { label: 'Late arrivals', value: chartData.filter((item) => item.late).length, color: '#e94b2e' },
    { label: 'Early checkouts', value: chartData.filter((item) => item.early).length, color: '#e67e22' },
    { label: 'Under 8 hours', value: chartData.filter((item) => item.underEight).length, color: '#fb3b5e' },
  ];

  return (
    <div className="charts-grid">
      <article className="chart-card">
        <div className="chart-heading"><h3>Recorded time by day</h3><span>8h target</span></div>
        <div className="bar-chart" aria-label="Recorded time by day">
          {chartData.map((item) => (
            <div className="bar-column" key={item.date} title={`${item.date}: ${item.minutes} minutes`}>
              <div className="bar-track">
                <span className={item.underEight ? 'bar under' : 'bar'} style={{ height: `${Math.max(item.minutes ? 5 : 2, (item.minutes / maxMinutes) * 100)}%` }} />
              </div>
              <small>{item.date.slice(5)}</small>
            </div>
          ))}
          {chartData.length === 0 && <p className="chart-empty">No history in this range.</p>}
        </div>
      </article>
      <article className="chart-card">
        <div className="chart-heading"><h3>Flag summary</h3><span>{chartData.length} days</span></div>
        <div className="metric-bars">
          {metrics.map((metric) => (
            <div className="metric-row" key={metric.label}>
              <div><span>{metric.label}</span><b>{metric.value}</b></div>
              <div className="metric-track"><span style={{ width: `${(metric.value / statusTotal) * 100}%`, background: metric.color }} /></div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function AttendanceCalendar({ rows, month, setMonth }) {
  const weeks = buildCalendarWeeks(rows, month);
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <section className="calendar-card" aria-label="Monthly attendance calendar">
      <div className="calendar-heading">
        <div><h3>{monthLabel}</h3><span>Biometric attendance by day</span></div>
        <label><span>Month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      </div>
      <div className="calendar-grid calendar-weekdays">{dayNames.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid calendar-days">{weeks.flat().map((cell, index) => <div className={cell.date ? `calendar-day ${cell.row ? 'has-attendance' : ''}` : 'calendar-day empty'} key={cell.date || `empty-${index}`}>
        {cell.date && <><b>{Number(cell.date.slice(-2))}</b>{cell.row && <><span className={cell.row.status.length ? 'calendar-dot flagged' : 'calendar-dot'} /><small>{cell.row.lastOut ? formatTime(cell.row.firstIn) : 'In office'}</small></>}</>}
      </div>)}</div>
      <div className="calendar-legend"><span><i className="calendar-dot" />Recorded attendance</span><span><i className="calendar-dot flagged" />Flagged attendance</span></div>
    </section>
  );
}

function UserReportPage({ userOptions, usersLoading, selectedUserId, setSelectedUserId, historyFrom, setHistoryFrom, historyTo, setHistoryTo, loadUserHistory, history, historyState, historyError, calendarMonth, setCalendarMonth }) {
  const isHistoryLoading = historyState === 'loading';

  return (
    <>
      <section className="page-hero" aria-label="User report header">
        <div>
          <span className="hero-eyebrow">Individual History</span>
          <h1 className="hero-title">Employee Attendance Report</h1>
        </div>
        <div className="hero-meta">
          <span className="meta-pill">Read-only history</span>
        </div>
      </section>

      <section className="history-card user-report-page">
        <div className="section-title">
          <div>
            <h2>User report</h2>
            <p className="page-subtitle">Review biometric attendance for one employee across selected dates.</p>
          </div>
          <div className="section-actions"><span className="scope-note">COSEC biometric feed</span><button className="reset-button" type="button" onClick={() => downloadAttendanceExcel(history?.rows || [], `attendance-${selectedUserId || 'user'}-${historyFrom || 'from'}-to-${historyTo || 'to'}`)} disabled={historyState !== 'ready' || !history?.rows.length}>Export Excel</button></div>
        </div>
        <div className="history-controls">
          <div className="control-field employee-combobox-field">
            <span className="field-label">Employee</span>
            <EmployeeCombobox
              options={userOptions}
              selectedUserId={selectedUserId}
              onSelect={setSelectedUserId}
              loading={usersLoading}
            />
          </div>
          <label><span>From</span><input type="date" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} /></label>
          <button
            className="primary-button"
            type="button"
            onClick={loadUserHistory}
            disabled={!selectedUserId || !historyFrom || !historyTo || isHistoryLoading}
          >
            {isHistoryLoading ? (
              <span className="button-loading"><Spinner light size={14} />Loading…</span>
            ) : (
              'Load report'
            )}
          </button>
        </div>
        {historyState === 'idle' && <p className="history-message">Select an employee and date range to view attendance history.</p>}
        {isHistoryLoading && (
          <>
            <SummaryCardsSkeleton />
            <ChartsSkeleton />
            <div className="table-wrap history-table">
              <table>
                <thead><tr><th>Date</th><th>Location</th><th>First in</th><th>Last out</th><th>Recorded time</th><th>Status</th></tr></thead>
                <tbody><TableRowsSkeleton rows={5} showEmployee={false} /></tbody>
              </table>
            </div>
          </>
        )}
        {historyState === 'error' && <p className="history-message error-message">{historyError}</p>}
        {historyState === 'ready' && (
          <>
            <SummaryCards summary={history.summary} presentDaysRows={history.rows} />
            <AttendanceCalendar rows={history.rows} month={calendarMonth} setMonth={setCalendarMonth} />
            <HistoryCharts rows={history.rows} />
            <div className="table-wrap history-table">
              <table>
                <thead><tr><th>Date</th><th>Location</th><th>First in</th><th>Last out</th><th>Recorded time</th><th>Status</th></tr></thead>
                <tbody>
                  {history.rows.map((row) => (
                    <tr key={`${row.userId}-${row.date}`}>
                      <td className="num-cell">{row.date}</td>
                      <td><span className="location-tag">{row.location}</span></td>
                      <td className="num-cell">{formatTime(row.firstIn)}</td>
                      <td className="num-cell">{row.lastOut ? formatTime(row.lastOut) : <span className="in-office">In office</span>}</td>
                      <td className="num-cell">{row.recordedTime}</td>
                      <td><div className="status-list">{row.status.map((status) => <span className={statusClassName(status)} key={status}>{statusLabel(status)}</span>)}</div></td>
                    </tr>
                  ))}
                  {history.rows.length === 0 && <tr><td colSpan="6" className="table-message">No biometric history for this employee and date range.</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="table-footer"><span>{history.rows.length ? `${presentDaysLabel(history.rows)} present days` : 'No records'}</span></footer>
          </>
        )}
      </section>
    </>
  );
}

function App() {
  const [page, setPage] = useState(() => window.location.hash === '#user-report' ? 'user-report' : 'dashboard');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('All');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [report, setReport] = useState({ rows: [], summary: { late: 0, early: 0, underEight: 0 } });
  const [pageNumber, setPageNumber] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [history, setHistory] = useState(null);
  const [historyState, setHistoryState] = useState('idle');
  const [historyError, setHistoryError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState('');

  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash === '#user-report' ? 'user-report' : 'dashboard');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    fetch('/api/attendance/users')
      .then((response) => { if (!response.ok) throw new Error('Unable to load employees'); return response.json(); })
      .then((result) => setUsers(result.users || []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    setPageNumber(1);
  }, [date, location, search, tab]);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setError('');
    const params = new URLSearchParams({ page: String(pageNumber), pageSize: '10', location, search, tab });
    if (date) params.set('date', date);
    const endpoint = `/api/attendance?${params.toString()}`;
    fetch(endpoint, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error('Unable to load attendance'); return response.json(); }).then((nextReport) => {
      if (!date && nextReport.date) setDate(nextReport.date);
      if (!historyFrom && nextReport.date) setHistoryFrom(nextReport.date);
      if (!historyTo && nextReport.date) setHistoryTo(nextReport.date);
      if (!calendarMonth && nextReport.date) setCalendarMonth(nextReport.date.slice(0, 7));
      setReport(nextReport);
      setPagination(nextReport.pagination || { page: pageNumber, pageSize: 10, total: nextReport.rows.length, totalPages: 1 });
      setState('ready');
    }).catch((requestError) => { if (requestError.name !== 'AbortError') { setError(requestError.message); setState('error'); } });
    return () => controller.abort();
  }, [date, location, pageNumber, search, tab]);

  const userOptions = useMemo(() => [...(users.length ? users : report.rows)].sort((a, b) => a.employee.localeCompare(b.employee)), [report.rows, users]);

  function openUserReport(userId) {
    setSelectedUserId(userId);
    setCalendarMonth((historyTo || date || '2026-01').slice(0, 7));
    window.location.hash = 'user-report';
  }

  function resetFilters() {
    setDate(''); setLocation('All'); setSearch(''); setTab('all'); setPageNumber(1);
  }

  function loadUserHistory() {
    if (!selectedUserId || !historyFrom || !historyTo) return;
    setCalendarMonth(historyTo.slice(0, 7));
    setHistoryState('loading'); setHistoryError('');
    fetch(`/api/attendance/history?userId=${encodeURIComponent(selectedUserId)}&from=${encodeURIComponent(historyFrom)}&to=${encodeURIComponent(historyTo)}`).then((response) => { if (!response.ok) throw new Error('Unable to load user history'); return response.json(); }).then((nextHistory) => { setHistory(nextHistory); setHistoryState('ready'); }).catch((requestError) => { setHistoryError(requestError.message); setHistoryState('error'); });
  }

  return (
    <div className="app-layout">
      <Navigation page={page} dataSource={DATA_SOURCE_LABEL} />
      <main className="app-shell">
        {page === 'dashboard' ? (
          <DashboardPage
            date={date}
            setDate={setDate}
            location={location}
            setLocation={setLocation}
            search={search}
            setSearch={setSearch}
            tab={tab}
            setTab={setTab}
            report={report}
            state={state}
            error={error}
            onSelectUser={openUserReport}
            resetFilters={resetFilters}
            pagination={pagination}
            setPage={setPageNumber}
          />
        ) : (
          <UserReportPage
            userOptions={userOptions}
            usersLoading={usersLoading}
            selectedUserId={selectedUserId}
            setSelectedUserId={setSelectedUserId}
            historyFrom={historyFrom}
            setHistoryFrom={setHistoryFrom}
            historyTo={historyTo}
            setHistoryTo={setHistoryTo}
            loadUserHistory={loadUserHistory}
            history={history}
            historyState={historyState}
            historyError={historyError}
            calendarMonth={calendarMonth || (historyTo || date || '2026-01').slice(0, 7)}
            setCalendarMonth={setCalendarMonth}
          />
        )}
      </main>
      <footer className="site-footer">
        <span>techcarrot · Digital Transformation Partner</span>
        <span>Biometric Attendance Portal</span>
      </footer>
    </div>
  );
}

export default App;
