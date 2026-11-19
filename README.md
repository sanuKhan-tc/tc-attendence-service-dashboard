# COSEC biometric attendance dashboard

Read-only Node + React dashboard for the hard-coded biometric attendance scope.

## Run

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

The API uses Windows authentication against local SQL Server by default:

```text
Server: localhost
Database: COSEC
Driver: ODBC Driver 18 for SQL Server
```

Override these with `DB_SERVER`, `DB_DATABASE`, or `DB_CONNECTION_STRING` if needed. No database writes or schema changes are performed.

Set `VITE_LIVE_DATA_ENABLED=true` to label the navigation as `Live data`; the default `false` label is `Local backup data`.

The dashboard loads the latest available biometric date when no date is selected. Use the employee selector and from/to dates in User history for a per-user report.

Overview attendance is loaded in pages of 10 records. User reports include a month calendar, charts, and the detailed history table for the selected date range.
