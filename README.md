# Techcarrot Attendance Dashboard

Read-only attendance reporting for biometric face identification at the Dubai office and biometric attendance devices across the India offices. The dashboard reads attendance data from the local COSEC Microsoft SQL Server database and presents operational reports in a React interface.

## What it includes

- Daily attendance overview with late arrival, early checkout, and under-eight-hour flags.
- Dubai and India location filters with employee search.
- Server-side pagination with 10 records per page.
- Employee history reports for a selected date range.
- Monthly calendar and attendance charts for employee history.
- Excel export for the visible overview page and loaded employee history.
- Read-only SQL access; no database writes or schema changes.

## Attendance scope

| Office | Device | Type | Late cutoff | Office end |
| --- | --- | --- | --- | --- |
| Dubai | `TA-tc Dubai-Device-1` | Biometric face ID | 08:30 | 17:00 |
| India | `TC-Hyderabad` | Biometric attendance | 09:30 | 18:00 |
| India | `TC-Noida` | Biometric attendance | 09:30 | 18:00 |
| India | `TC- Chennai` | Biometric attendance | 09:30 | 18:00 |
| India | `techcarrot-Cafeteria` | Biometric attendance | 09:30 | 18:00 |

The device mapping and attendance rules are currently hard-coded in `server/attendance.js`.

## Architecture

```text
Browser :5173
    │
    └── Vite /api proxy
            │
            ▼
       Express API :3001
            │
            ▼
       COSEC SQL Server
```

The Vite development server proxies `/api` requests to the Express API. The Express server reads biometric punch columns from COSEC and serves the production `dist` directory after a build.

## Requirements

- Node.js
- pnpm
- Windows authentication access to the local SQL Server
- SQL Server ODBC Driver 18
- Access to the `COSEC` database

## Quick start

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Open <http://localhost:5173>.

The combined development command starts both services:

- Vite frontend: `http://localhost:5173`
- Express API: `http://localhost:3001`

## Configuration

Edit `.env` for local settings:

```env
DB_SERVER=localhost
DB_DATABASE=COSEC
PORT=3001
VITE_LIVE_DATA_ENABLED=false
```

| Variable | Default | Description |
| --- | --- | --- |
| `DB_SERVER` | `localhost` | SQL Server host or instance. |
| `DB_DATABASE` | `COSEC` | Database containing COSEC attendance data. |
| `PORT` | `3001` | Express API port. |
| `DB_CONNECTION_STRING` | — | Optional complete ODBC connection string. |
| `VITE_LIVE_DATA_ENABLED` | `false` | Controls the navigation label: `true` shows `Live data`; any other value shows `Local backup data`. |

`VITE_LIVE_DATA_ENABLED` controls the display label only. It does not change the database query or switch between data stores. Restart `pnpm dev` or rebuild after changing any `VITE_` variable.

For a complete connection-string override:

```env
DB_CONNECTION_STRING=Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=COSEC;Trusted_Connection=Yes;TrustServerCertificate=Yes;
```

Never commit `.env`. Use `.env.example` as the shareable template.

## Available commands

```powershell
pnpm dev       # Start Vite and Express together
pnpm server    # Start the Express server only
pnpm build     # Build the frontend into dist/
pnpm test      # Run the Node test suite
```

Production-style local run:

```powershell
pnpm build
pnpm server
```

Then open <http://localhost:3001>.

## API endpoints

### Daily attendance

```text
GET /api/attendance
```

Supported query parameters:

- `date=YYYY-MM-DD`
- `page=1`
- `pageSize=10`
- `location=All|Dubai|India`
- `search=name-or-user-id`
- `tab=all|late|early|underEight`

When `date` is omitted, the API selects the latest available biometric date.

### Employee list

```text
GET /api/attendance/users
```

### Employee history

```text
GET /api/attendance/history?userId=EMP-101&from=2026-10-01&to=2026-10-12
```

The API validates the employee ID and date range before querying COSEC.

## Data and privacy notes

- The application currently has no authentication or authorization layer.
- It is intended for a trusted internal network until authentication is added.
- SQL queries are read-only and use parameterized request values.
- Database credentials belong in the local `.env` file and must not be committed.
- The current employee and device scope is configured in source code and should be externalized before multi-tenant or administrator-managed configuration is introduced.

## Project structure

```text
server/
  attendance.js  Device rules and report calculation
  db.js          SQL Server access
  index.js       Express API and static file server
  query.js       Read-only SQL query builders
src/
  App.jsx        Dashboard and user report pages
  attendanceUi.js UI data helpers
  excelExport.js Excel workbook export
  styles.css     Dashboard styling
test/            Attendance, query, UI, and export tests
```

## Verification

Run the full test suite and production build before sharing changes:

```powershell
pnpm test
pnpm build
```

The repository also includes `.gitignore`, `.gitattributes`, and `.editorconfig` for local secrets, generated files, line endings, and editor consistency.
