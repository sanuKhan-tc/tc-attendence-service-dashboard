import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCalendarWeeks,
  buildHistoryChartData,
  dataSourceLabel,
  filterAttendanceRows,
  filterEmployeeOptions,
  accessSourceKind,
  formatTableDateRange,
  formatTime,
  getOverviewDateRange,
  isTodayDateRange,
  paginateRows,
  presentDaysLabel,
} from './attendanceUi.js';
import { fetchAllAttendanceRows } from './attendanceExport.js';
import versionInfo from '../version.json';

const LOCATIONS = ['All', 'Dubai', 'India', 'India - Hyderabad', 'India - Noida', 'India - Chennai'];
const OVERVIEW_DATE_PRESETS = [
  { value: 'latest', label: 'Latest available' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'last-6-months', label: 'Last 6 months' },
];
const TABS = [
  { id: 'all', label: 'All flagged' },
  { id: 'late', label: 'Late arrivals' },
  { id: 'early', label: 'Early leavers' },
  { id: 'underEight', label: 'Under 8 hours' },
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const SKELETON_BAR_HEIGHTS = [72, 86, 54, 92, 68, 45, 80, 76, 62, 88];
const DATA_SOURCE_LABEL = dataSourceLabel(import.meta.env.VITE_LIVE_DATA_ENABLED);
const APP_VERSION = versionInfo.version;
const SEARCH_DEBOUNCE_MS = 250;
const CLIENT_CACHE_TTL_MS = 30_000;
const CLIENT_CACHE_MAX = 25;

function pageFromHash() {
  if (window.location.hash === '#user-report') return 'user-report';
  if (window.location.hash === '#changelog') return 'changelog';
  return 'dashboard';
}

function getCachedEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function setCachedEntry(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
  if (cache.size > CLIENT_CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
}

function buildAttendanceParams({ pageNumber, location, search, tab, startDate, endDate }) {
  const params = new URLSearchParams({ page: String(pageNumber), pageSize: '10', location, search, tab });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return params;
}

async function exportAttendanceExcel(rows, filename, options) {
  const { downloadAttendanceExcel } = await import('./excelExport.js');
  downloadAttendanceExcel(rows, filename, options);
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function statusLabel(status, row = null, showCount = false) {
  const base = status === 'Early checkout' ? 'Early checkout · provisional' : status;
  if (!showCount || !row) return base;
  const count = status === 'Late arrival'
    ? row.lateCount
    : status === 'Early checkout'
      ? row.earlyCount
      : row.underEightCount;
  return count ? `${base} (${count})` : base;
}

function statusClassName(status) {
  if (status === 'Late arrival') return 'status late-status';
  if (status === 'Under 8 hours') return 'status under-status';
  return 'status early-status';
}

function formatEmployeeLabel(user) {
  return `${user.employee} · ${user.userId}`;
}

function AccessSourcePill({ source }) {
  return <span className={`access-pill ${accessSourceKind(source)}`}>{source || '—'}</span>;
}

function PunchSourceCell({ firstInSource, lastOutSource }) {
  return (
    <div className="access-source-list">
      <span className={`access-pill access-direction-pill ${accessSourceKind(firstInSource)}`}>IN</span>
      <span className="access-source-separator" aria-hidden="true">-</span>
      <span className={`access-pill access-direction-pill ${accessSourceKind(lastOutSource)}`}>OUT</span>
    </div>
  );
}

function PunchSourceLegend() {
  return (
    <span className="access-source-legend" aria-label="Punch source legend">
      <span>Punch source:</span>
      <span><AccessSourcePill source="Door Access" /> Door Access</span>
      <span><AccessSourcePill source="Face ID" /> Face ID</span>
    </span>
  );
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

const Navigation = memo(function Navigation({ page, dataSource }) {
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
});

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

function TableRowsSkeleton({ rows = 6, showEmployee = true, showDate = false, showTimes = true, showSource = false }) {
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
      {showDate && <td><span className="skeleton skeleton-line w-64" /></td>}
      <td><span className="skeleton skeleton-pill w-64" /></td>
      {showTimes && (
        <>
          <td><span className="skeleton skeleton-line w-56" /></td>
          <td><span className="skeleton skeleton-line w-56" /></td>
        </>
      )}
      {!showEmployee && <td><span className="skeleton skeleton-line w-64" /></td>}
      {showSource && <td><span className="skeleton skeleton-line w-110" /></td>}
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

const SummaryCards = memo(function SummaryCards({ summary, presentDaysRows }) {
  return (
    <section className={presentDaysRows === undefined ? 'summary-grid' : 'summary-grid summary-grid-four'} aria-label="Attendance summary">
      <article className="summary-card late-card">
        <div className="summary-heading">
          <span className="summary-icon"><LateIcon /></span>
          <span>Late arrivals</span>
        </div>
        <strong>{summary.late}</strong>
        <small>Dubai after 08:30 · India after 10:00 · Chennai after 10:30</small>
      </article>
      <article className="summary-card early-card">
        <div className="summary-heading">
          <span className="summary-icon"><EarlyIcon /></span>
          <span>Early leavers</span>
        </div>
        <strong>{summary.early}</strong>
        <small>Dubai before 17:00 · India before 18:30 · Chennai before 19:00</small>
      </article>
      <article className="summary-card hours-card">
        <div className="summary-heading">
          <span className="summary-icon"><HoursIcon /></span>
          <span>Under 8 hours</span>
        </div>
        <strong>{summary.underEight || '—'}</strong>
        <small>{summary.underEight ? 'Completed work intervals' : 'Available for completed intervals'}</small>
      </article>
      {presentDaysRows !== undefined && (
        <article className="summary-card present-card">
          <div className="summary-heading">
            <span className="summary-icon"><DaysIcon /></span>
            <span>Days present</span>
          </div>
          <strong>{presentDaysLabel(presentDaysRows)}</strong>
          <small>Days with recorded attendance</small>
        </article>
      )}
    </section>
  );
});

const EmployeeCombobox = memo(function EmployeeCombobox({ options, selectedUserId, onSelect, loading }) {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const selectedUser = useMemo(
    () => options.find((user) => user.userId === selectedUserId) ?? null,
    [options, selectedUserId],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selectedUser ? formatEmployeeLabel(selectedUser) : '');
  }, [selectedUser]);

  const filteredOptions = useMemo(() => {
    if (selectedUser && deferredQuery === formatEmployeeLabel(selectedUser)) {
      return options;
    }
    return filterEmployeeOptions(options, deferredQuery);
  }, [options, deferredQuery, selectedUser]);

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
});

function DashboardPage({ datePreset, setDatePreset, startDate, setStartDate, endDate, setEndDate, location, setLocation, search, setSearch, tab, setTab, report, state, error, onSelectUser, resetFilters, pagination, setPage, onExport, isExporting, exportError, onPresetChange }) {
  const isLoading = state === 'loading';
  const isDateRange = Boolean(startDate && endDate && startDate !== endDate);
  const isToday = isTodayDateRange(startDate, endDate);
  const columnCount = isDateRange ? 4 : 7;
  const hasTableFilters = location !== 'All' || Boolean(search) || tab !== 'all';
  const visibleRows = useMemo(() => {
    const flaggedRows = report.rows.filter((row) => row.status.length > 0);
    return filterAttendanceRows(flaggedRows, { location, search, tab });
  }, [location, report.rows, search, tab]);

  return (
    <>
      <section className="page-hero" aria-label="Attendance overview header">
        <div>
          <span className="hero-eyebrow">Workforce Operations</span>
          <h1 className="hero-title">Attendance Overview</h1>
        </div>
        <div className="hero-meta">
          <span className="meta-pill">{location === 'All' ? 'Dubai & India' : location}</span>
          <span className="meta-pill meta-date">{formatTableDateRange(startDate, endDate)}</span>
        </div>
      </section>

      <section className="filter-card" aria-label="Attendance filters">
        <label>
          <span>Day</span>
          <span className="weekend-hint">Sat &amp; Sun are off days</span>
          <div className={isLoading ? 'select-wrap is-loading' : 'select-wrap'}>
            <select value={datePreset} aria-label="Day" onChange={(event) => onPresetChange(event.target.value)} disabled={isLoading}>
              {datePreset === 'custom' && <option value="custom" disabled>Custom range</option>}
              {OVERVIEW_DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
            {isLoading && <span className="field-loader" aria-hidden="true"><Spinner size={14} /></span>}
          </div>
        </label>
        <label>
          <span>Start date</span>
          <input type="date" value={startDate} onChange={(event) => { setDatePreset('custom'); setStartDate(event.target.value); }} />
        </label>
        <label>
          <span>End date</span>
          <input type="date" value={endDate} onChange={(event) => { setDatePreset('custom'); setEndDate(event.target.value); }} />
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
        <div className="section-title"><h2>Flagged staff</h2><div className="section-actions">{exportError && <span className="error-message" role="alert">{exportError}</span>}<button className="reset-button" type="button" onClick={onExport} disabled={state !== 'ready' || pagination.total === 0 || isExporting}>{isExporting ? 'Preparing export…' : 'Export Excel'}</button></div></div>
        <div className="tabs" role="tablist" aria-label="Flagged staff filters">{TABS.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'tab active' : 'tab'} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        <div className="table-wrap flagged-table-wrap" aria-busy={isLoading}><table className="flagged-table"><thead><tr><th>Employee</th><th>Date</th><th>Location</th>{!isDateRange && <><th>First in</th><th>Last out</th><th>Punch source</th></>}<th>Status</th></tr></thead><tbody>
          {isLoading && <TableRowsSkeleton rows={6} showEmployee showDate showTimes={!isDateRange} showSource={!isDateRange} />}
          {state === 'error' && <tr><td colSpan={columnCount} className="table-message error-message">{error}</td></tr>}
          {state === 'ready' && visibleRows.map((row) => <tr className="clickable-table-row" key={row.userId} onClick={() => onSelectUser(row.userId)}>
            <td><button className="employee-cell employee-button" type="button" onClick={(event) => { event.stopPropagation(); onSelectUser(row.userId); }}><span className="avatar">{initials(row.employee)}</span><span><b>{row.employee}</b><small>{row.userId}</small></span></button></td>
            <td className="num-cell">{formatTableDateRange(startDate, endDate)}</td>
            <td><span className="location-tag">{row.location}</span></td>
            {!isDateRange && (
              <>
                <td className="num-cell">{formatTime(row.firstIn)}</td>
                <td className="num-cell">{row.lastOut ? formatTime(row.lastOut) : <span className="in-office">{isToday ? 'In office' : 'Not logged out'}</span>}</td>
              </>
            )}
            {!isDateRange && <td><PunchSourceCell firstInSource={row.firstInSource} lastOutSource={row.lastOutSource} /></td>}
            <td><div className="status-list">{row.status.map((status) => <span className={statusClassName(status)} key={status}>{statusLabel(status, row, true)}</span>)}</div></td>
          </tr>)}
          {state === 'ready' && visibleRows.length === 0 && <tr><td colSpan={columnCount} className="table-message"><div className="table-empty"><span className="table-empty-icon" aria-hidden="true">✓</span><strong>No flagged staff found</strong><span>{hasTableFilters ? 'Try clearing a filter or choosing another date.' : 'No attendance exceptions were found for this selection.'}</span>{hasTableFilters && <button type="button" className="table-empty-action" onClick={resetFilters}>Clear table filters</button>}</div></td></tr>}
        </tbody></table></div>
        <footer className="table-footer">{isLoading ? <span>Loading attendance records…</span> : <>{!isDateRange && <PunchSourceLegend />}<span>Showing {visibleRows.length} flagged employees · {pagination.total} records · Page {pagination.page} of {pagination.totalPages}</span><span className="pagination-controls"><button type="button" onClick={() => setPage(pagination.page - 1)} disabled={pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</button></span></>}</footer>
      </section>
    </>
  );
}

const HistoryCharts = memo(function HistoryCharts({ rows }) {
  const { chartData, maxMinutes, statusTotal, metrics } = useMemo(() => {
    const data = buildHistoryChartData(rows);
    let lateCount = 0;
    let earlyCount = 0;
    let underEightCount = 0;
    let maxMins = 480;
    for (const item of data) {
      if (item.minutes > maxMins) maxMins = item.minutes;
      if (item.late) lateCount += 1;
      if (item.early) earlyCount += 1;
      if (item.underEight) underEightCount += 1;
    }
    return {
      chartData: data,
      maxMinutes: Math.max(maxMins, 1),
      statusTotal: data.length || 1,
      metrics: [
        { label: 'Late arrivals', value: lateCount, color: '#e94b2e' },
        { label: 'Early checkouts', value: earlyCount, color: '#e67e22' },
        { label: 'Under 8 hours', value: underEightCount, color: '#fb3b5e' },
      ],
    };
  }, [rows]);

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
});

const AttendanceCalendar = memo(function AttendanceCalendar({ rows, month, setMonth }) {
  const cells = useMemo(() => buildCalendarWeeks(rows, month).flat(), [rows, month]);
  const monthLabel = useMemo(
    () => MONTH_FORMATTER.format(new Date(`${month}-01T00:00:00Z`)),
    [month],
  );

  return (
    <section className="calendar-card" aria-label="Monthly attendance calendar">
      <div className="calendar-heading">
        <div><h3>{monthLabel}</h3><span>Attendance by day</span></div>
        <label><span>Month</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      </div>
      <div className="calendar-grid calendar-weekdays">{DAY_NAMES.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid calendar-days">{cells.map((cell, index) => <div className={cell.date ? `calendar-day ${cell.row ? 'has-attendance' : ''}` : 'calendar-day empty'} key={cell.date || `empty-${index}`}>
        {cell.date && <><b>{Number(cell.date.slice(-2))}</b>{cell.row && <><span className={cell.row.status.length ? 'calendar-dot flagged' : 'calendar-dot'} /><small>{cell.row.lastOut ? formatTime(cell.row.firstIn) : 'In office'}</small></>}</>}
      </div>)}</div>
      <div className="calendar-legend"><span><i className="calendar-dot" />Recorded attendance</span><span><i className="calendar-dot flagged" />Flagged attendance</span></div>
    </section>
  );
});

function UserReportPage({ userOptions, usersLoading, selectedUserId, setSelectedUserId, historyPreset, setHistoryPreset, historyFrom, setHistoryFrom, historyTo, setHistoryTo, onHistoryPresetChange, loadUserHistory, resetHistoryFilters, history, historyState, historyError, calendarMonth, setCalendarMonth }) {
  const isHistoryLoading = historyState === 'loading';
  const [historyPage, setHistoryPage] = useState(1);
  const visibleHistory = history?.rows || [];
  const visibleSummary = useMemo(() => ({
    late: visibleHistory.filter((row) => row.late).length,
    early: visibleHistory.filter((row) => row.early).length,
    underEight: visibleHistory.filter((row) => row.underEight).length,
  }), [visibleHistory]);

  useEffect(() => {
    setHistoryPage(1);
  }, [history]);

  const pagedHistory = useMemo(
    () => paginateRows(visibleHistory, historyPage, 10),
    [historyPage, visibleHistory],
  );

  return (
    <>
      <section className="page-hero" aria-label="User report header">
        <div>
          <span className="hero-eyebrow">Individual History</span>
          <h1 className="hero-title">Employee Attendance Report</h1>
        </div>
      </section>

      <section className="history-card user-report-page">
        <div className="section-title">
          <div>
            <h2>User report</h2>
            <p className="page-subtitle">Review attendance for one employee across selected dates.</p>
          </div>
          <div className="section-actions"><button className="reset-button" type="button" onClick={() => exportAttendanceExcel(visibleHistory, `attendance-${selectedUserId || 'user'}-${historyFrom || 'from'}-to-${historyTo || 'to'}`)} disabled={historyState !== 'ready' || !visibleHistory.length}>Export Excel</button></div>
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
          <label>
            <span>Day</span>
            <span className="weekend-hint">Sat &amp; Sun are off days</span>
            <select value={historyPreset} aria-label="User report day" onChange={(event) => onHistoryPresetChange(event.target.value)}>
              {historyPreset === 'custom' && <option value="custom" disabled>Custom range</option>}
              {OVERVIEW_DATE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
            </select>
          </label>
          <label><span>From</span><input type="date" value={historyFrom} onChange={(event) => { setHistoryPreset('custom'); setHistoryFrom(event.target.value); }} /></label>
          <label><span>To</span><input type="date" value={historyTo} onChange={(event) => { setHistoryPreset('custom'); setHistoryTo(event.target.value); }} /></label>
          <button
            className="primary-button"
            type="button"
            onClick={loadUserHistory}
            disabled={!selectedUserId || (historyPreset !== 'latest' && (!historyFrom || !historyTo)) || isHistoryLoading}
          >
            {isHistoryLoading ? (
              <span className="button-loading"><Spinner light size={14} />Loading…</span>
            ) : (
              'Load report'
            )}
          </button>
          <button className="reset-button" type="button" onClick={resetHistoryFilters}>Reset filters</button>
        </div>
        {historyState === 'idle' && <p className="history-message">Select an employee and date range to view attendance history.</p>}
        {isHistoryLoading && (
          <>
            <SummaryCardsSkeleton />
            <ChartsSkeleton />
            <div className="table-wrap history-table">
              <table>
                <thead><tr><th>Date</th><th>Location</th><th>First in</th><th>Last out</th><th>Recorded time</th><th>Punch source</th><th>Status</th></tr></thead>
                <tbody><TableRowsSkeleton rows={5} showEmployee={false} showSource /></tbody>
              </table>
            </div>
          </>
        )}
        {historyState === 'error' && <p className="history-message error-message">{historyError}</p>}
        {historyState === 'ready' && (
          <>
            <SummaryCards summary={visibleSummary} presentDaysRows={visibleHistory} />
            <AttendanceCalendar rows={visibleHistory} month={calendarMonth} setMonth={setCalendarMonth} />
            <HistoryCharts rows={visibleHistory} />
            <div className="table-wrap history-table">
              <table>
                <thead><tr><th>Date</th><th>Location</th><th>First in</th><th>Last out</th><th>Recorded time</th><th>Punch source</th><th>Status</th></tr></thead>
                <tbody>
                  {pagedHistory.rows.map((row) => (
                    <tr key={`${row.userId}-${row.date}`}>
                      <td className="num-cell">{row.date}</td>
                      <td><span className="location-tag">{row.location}</span></td>
                      <td className="num-cell">{formatTime(row.firstIn)}</td>
                      <td className="num-cell">{row.lastOut ? formatTime(row.lastOut) : <span className="in-office">In office</span>}</td>
                      <td className="num-cell">{row.recordedTime}</td>
                      <td><PunchSourceCell firstInSource={row.firstInSource} lastOutSource={row.lastOutSource} /></td>
                      <td><div className="status-list">{row.status.map((status) => <span className={statusClassName(status)} key={status}>{statusLabel(status)}</span>)}</div></td>
                    </tr>
                  ))}
                  {pagedHistory.total === 0 && <tr><td colSpan="7" className="table-message">No attendance history for this employee and date range.</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="table-footer">
              <PunchSourceLegend />
              <span>
                {pagedHistory.total
                  ? `Showing ${pagedHistory.rows.length} of ${pagedHistory.total} records (${presentDaysLabel(visibleHistory)} present days) · Page ${pagedHistory.page} of ${pagedHistory.totalPages}`
                  : 'No records'}
              </span>
              {pagedHistory.total > 0 && (
                <span className="pagination-controls">
                  <button type="button" onClick={() => setHistoryPage((current) => Math.max(1, current - 1))} disabled={pagedHistory.page <= 1}>Previous</button>
                  <button type="button" onClick={() => setHistoryPage((current) => Math.min(pagedHistory.totalPages, current + 1))} disabled={pagedHistory.page >= pagedHistory.totalPages}>Next</button>
                </span>
              )}
            </footer>
          </>
        )}
      </section>
    </>
  );
}

function ChangelogPage() {
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    fetch('/changelog.json')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load changelog');
        return response.json();
      })
      .then((nextEntries) => {
        setEntries(Array.isArray(nextEntries) ? nextEntries : []);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  return (
    <section className="changelog-page" aria-label="Application changelog">
      <div className="page-hero changelog-hero">
        <div>
          <span className="hero-eyebrow">Release history</span>
          <h1 className="hero-title">Changelog</h1>
          <p className="page-subtitle">Recent project updates from the main branch.</p>
        </div>
        <span className="meta-pill meta-date">v{APP_VERSION}</span>
      </div>
      <div className="changelog-list">
        {state === 'loading' && <p className="changelog-message">Loading changelog…</p>}
        {state === 'error' && <p className="changelog-message error-message">Unable to load changelog.</p>}
        {state === 'ready' && entries.length === 0 && <p className="changelog-message">No changelog entries available.</p>}
        {state === 'ready' && entries.map((entry) => (
          <article className="changelog-entry" key={entry.hash}>
            <time dateTime={entry.date}>{entry.date}</time>
            <div>
              <h2>{entry.message}</h2>
              <span className="changelog-hash">{entry.shortHash}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [page, setPage] = useState(pageFromHash);
  const [datePreset, setDatePreset] = useState('latest');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [report, setReport] = useState({ rows: [], summary: { late: 0, early: 0, underEight: 0 } });
  const [pageNumber, setPageNumber] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [historyPreset, setHistoryPreset] = useState('latest');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [history, setHistory] = useState(null);
  const [historyState, setHistoryState] = useState('idle');
  const [historyError, setHistoryError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState('');

  const usersLoadedRef = useRef(false);
  const lastAttendanceKeyRef = useRef('');
  const attendanceCacheRef = useRef(new Map());
  const historyAbortRef = useRef(null);
  const historyLoadRequestedRef = useRef(false);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Debounce employee search input to avoid firing an API call on every keystroke
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Lazy-load /api/attendance/users only when User Reports is opened, with AbortController
  useEffect(() => {
    if (page !== 'user-report' || usersLoadedRef.current) return undefined;

    const controller = new AbortController();
    setUsersLoading(true);

    fetch('/api/attendance/users', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load employees');
        return response.json();
      })
      .then((result) => {
        setUsers(result.users || []);
        usersLoadedRef.current = true;
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setUsers([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setUsersLoading(false);
        }
      });

    return () => controller.abort();
  }, [page]);

  // Abort any in-flight user history request when leaving User Reports or unmounting
  useEffect(() => {
    if (page !== 'user-report' && historyAbortRef.current) {
      historyAbortRef.current.abort();
      historyAbortRef.current = null;
    }
  }, [page]);

  useEffect(() => () => {
    historyAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    setPageNumber(1);
  }, [startDate, endDate, location, debouncedSearch, tab]);

  // Lazy-load /api/attendance only when Dashboard is active, with client-side TTL cache & AbortController
  useEffect(() => {
    if (page !== 'dashboard') return undefined;

    const params = buildAttendanceParams({
      pageNumber,
      location,
      search: debouncedSearch,
      tab,
      startDate,
      endDate,
    });
    const queryKey = params.toString();
    if (queryKey === lastAttendanceKeyRef.current) return undefined;

    const cachedReport = getCachedEntry(attendanceCacheRef.current, queryKey);
    if (cachedReport) {
      lastAttendanceKeyRef.current = queryKey;
      setReport(cachedReport);
      setPagination(cachedReport.pagination || { page: pageNumber, pageSize: 10, total: cachedReport.rows.length, totalPages: 1 });
      setError('');
      setState('ready');
      return undefined;
    }

    const controller = new AbortController();
    setState('loading');
    setError('');

    fetch(`/api/attendance?${queryKey}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load attendance');
        return response.json();
      })
      .then((nextReport) => {
        const resolvedStart = startDate || nextReport.startDate || '';
        const resolvedEnd = endDate || nextReport.endDate || '';
        const resolvedKey = buildAttendanceParams({
          pageNumber,
          location,
          search: debouncedSearch,
          tab,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        }).toString();

        lastAttendanceKeyRef.current = resolvedKey;
        setCachedEntry(attendanceCacheRef.current, resolvedKey, nextReport);

        if (!startDate && nextReport.startDate) setStartDate(nextReport.startDate);
        if (!endDate && nextReport.endDate) setEndDate(nextReport.endDate);
        if (!historyFrom && nextReport.startDate) setHistoryFrom(nextReport.startDate);
        if (!historyTo && nextReport.endDate) setHistoryTo(nextReport.endDate);
        if (!calendarMonth && nextReport.endDate) setCalendarMonth(nextReport.endDate.slice(0, 7));
        setReport(nextReport);
        setPagination(nextReport.pagination || { page: pageNumber, pageSize: 10, total: nextReport.rows.length, totalPages: 1 });
        setState('ready');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message);
          setState('error');
        }
      });

    return () => controller.abort();
  }, [page, startDate, endDate, location, pageNumber, debouncedSearch, tab]);

  const userOptions = useMemo(() => [...(users.length ? users : report.rows)].sort((a, b) => a.employee.localeCompare(b.employee)), [report.rows, users]);

  const openUserReport = useCallback((userId) => {
    const nextFrom = startDate;
    const nextTo = endDate;
    setSelectedUserId(userId);
    setHistoryPreset(nextFrom && nextTo ? 'custom' : 'latest');
    setHistoryFrom(nextFrom);
    setHistoryTo(nextTo);
    setHistory(null);
    setHistoryState('idle');
    setHistoryError('');
    historyLoadRequestedRef.current = true;
    setCalendarMonth((nextTo || nextFrom || '2026-01').slice(0, 7));
    window.location.hash = 'user-report';
  }, [endDate, startDate]);

  const resetFilters = useCallback(() => {
    lastAttendanceKeyRef.current = '';
    attendanceCacheRef.current.clear();
    setDatePreset('latest');
    setStartDate('');
    setEndDate('');
    setLocation('All');
    setSearch('');
    setDebouncedSearch('');
    setTab('all');
    setPageNumber(1);
  }, []);

  const onPresetChange = useCallback((preset) => {
    const nextRange = getOverviewDateRange(preset);
    setDatePreset(preset);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  }, []);

  const onHistoryPresetChange = useCallback((preset) => {
    const nextRange = getOverviewDateRange(preset);
    setHistoryPreset(preset);
    setHistoryFrom(nextRange.startDate);
    setHistoryTo(nextRange.endDate);
  }, []);

  const resetHistoryFilters = useCallback(() => {
    historyAbortRef.current?.abort();
    historyLoadRequestedRef.current = false;
    setSelectedUserId('');
    setHistoryPreset('latest');
    setHistoryFrom('');
    setHistoryTo('');
    setHistory(null);
    setHistoryState('idle');
    setHistoryError('');
    setCalendarMonth('');
  }, []);

  const loadUserHistory = useCallback(() => {
    if (!selectedUserId || (historyPreset !== 'latest' && (!historyFrom || !historyTo))) return;
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;

    if (historyTo) setCalendarMonth(historyTo.slice(0, 7));
    setHistoryState('loading');
    setHistoryError('');

    const params = new URLSearchParams({ userId: selectedUserId });
    if (historyFrom) params.set('from', historyFrom);
    if (historyTo) params.set('to', historyTo);

    fetch(`/api/attendance/history?${params}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load user history');
        return response.json();
      })
      .then((nextHistory) => {
        if (nextHistory.from) setHistoryFrom(nextHistory.from);
        if (nextHistory.to) {
          setHistoryTo(nextHistory.to);
          setCalendarMonth(nextHistory.to.slice(0, 7));
        }
        setHistory(nextHistory);
        setHistoryState('ready');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setHistoryError(requestError.message);
          setHistoryState('error');
        }
      })
      .finally(() => {
        if (historyAbortRef.current === controller) {
          historyAbortRef.current = null;
        }
      });
  }, [historyFrom, historyPreset, historyTo, selectedUserId]);

  useEffect(() => {
    if (page !== 'user-report' || !selectedUserId || !historyLoadRequestedRef.current) return;
    historyLoadRequestedRef.current = false;
    loadUserHistory();
  }, [page, selectedUserId, loadUserHistory]);

  const exportOverview = useCallback(async () => {
    setIsExporting(true);
    setExportError('');
    try {
      const rows = await fetchAllAttendanceRows(fetch, {
        startDate,
        endDate,
        location,
        search: debouncedSearch,
        tab,
      });
      const isDateRange = Boolean(startDate && endDate && startDate !== endDate);
      await exportAttendanceExcel(rows, `attendance-${startDate || 'latest'}-to-${endDate || startDate || 'latest'}`, { isDateRange });
    } catch (exportRequestError) {
      setExportError(exportRequestError.message || 'Unable to export attendance');
    } finally {
      setIsExporting(false);
    }
  }, [debouncedSearch, endDate, location, startDate, tab]);

  return (
    <div className="app-layout">
      <Navigation page={page} dataSource={DATA_SOURCE_LABEL} />
      <main className="app-shell">
        {page === 'dashboard' ? (
          <DashboardPage
            datePreset={datePreset}
            setDatePreset={setDatePreset}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
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
            onExport={exportOverview}
            isExporting={isExporting}
            exportError={exportError}
            onPresetChange={onPresetChange}
          />
        ) : page === 'user-report' ? (
          <UserReportPage
            userOptions={userOptions}
            usersLoading={usersLoading}
            selectedUserId={selectedUserId}
            setSelectedUserId={setSelectedUserId}
            historyPreset={historyPreset}
            setHistoryPreset={setHistoryPreset}
            historyFrom={historyFrom}
            setHistoryFrom={setHistoryFrom}
            historyTo={historyTo}
            setHistoryTo={setHistoryTo}
            onHistoryPresetChange={onHistoryPresetChange}
            loadUserHistory={loadUserHistory}
            resetHistoryFilters={resetHistoryFilters}
            history={history}
            historyState={historyState}
            historyError={historyError}
            calendarMonth={calendarMonth || (historyTo || endDate || startDate || '2026-01').slice(0, 7)}
            setCalendarMonth={setCalendarMonth}
          />
        ) : <ChangelogPage />}
      </main>
      <footer className="site-footer">
        <img className="footer-logo" src="/techcarrot-logo.svg" alt="techcarrot" width="110" height="28" />
        <a
          className={page === 'changelog' ? 'footer-version active' : 'footer-version'}
          href="#changelog"
          title="View changelog"
        >
          v{APP_VERSION}
        </a>
      </footer>
    </div>
  );
}

export default App;
