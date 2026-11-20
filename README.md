# Techcarrot Attendance Dashboard

Read-only attendance reporting for biometric face identification at the Dubai office and biometric attendance devices across the India offices. The dashboard reads attendance data from the local COSEC Microsoft SQL Server database and presents operational reports in a React interface.

## What it includes

- Attendance overview with start/end date filters and late arrival, early checkout, and under-eight-hour flags.
- Dubai and India location filters with employee search.
- Server-side pagination with 10 records per page.
- Employee history reports for a selected date range.
- Monthly calendar and attendance charts for employee history.
- Excel export for all filtered overview records and loaded employee history.
- Changelog page generated from dated commit messages on the current branch.
- Read-only attendance access; no attendance data writes or schema changes. The setup script creates only the SQL login, database user, and read-only role membership.

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
- Docker Desktop with Compose
- `sqlcmd` from the SQL Server command-line tools
- Windows authentication access to the local SQL Server
- SQL Server TCP/IP enabled on port 1433
- Access to the `COSEC` database

## Quick start

```powershell
.\scripts\setup-and-run.ps1
```

The setup script pulls the latest Git changes on every restart, reads and displays the application version from `version.json`, then uses Windows SQL authentication to create the read-only SQL login `tc_attendance_reader`, creates its `COSEC` database user with `db_datareader` access, creates `.env` on the first run, and builds/starts the Docker container. It prints a confirmation after the pull completes.

Open <http://localhost:9200>.

If `.env` already exists, the script prints `.env already installed; leaving it unchanged.` and does not overwrite it. To use a different local SQL Server or read-only login on the first run:

```powershell
.\scripts\setup-and-run.ps1 -SqlServer '.\SQLEXPRESS' -Database COSEC -ReadUser tc_attendance_reader
```

The first run must be started from an elevated Windows account with permission to create SQL logins and database users. If PowerShell blocks local scripts, run `Set-ExecutionPolicy -Scope Process Bypass` in the current terminal and retry.

The combined development command remains available when Docker is not required:

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Open <http://localhost:5173> for development.

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
DOCKER_DB_SERVER=host.docker.internal,1433
```

| Variable | Default | Description |
| --- | --- | --- |
| `DB_SERVER` | `localhost` | SQL Server host or instance. |
| `DOCKER_DB_SERVER` | `host.docker.internal,1433` | SQL Server host and TCP port used by Docker. |
| `DOCKER_DB_DRIVER` | `tedious` | Docker SQL client; use `tedious` for SQL authentication. |
| `DOCKER_DB_USER` | — | SQL login used by Docker. |
| `DOCKER_DB_PASSWORD` | — | Password for the Docker SQL login. |
| `DOCKER_DB_ENCRYPT` | `false` | Enables SQL transport encryption when set to `true`. |
| `DOCKER_DB_CONNECTION_STRING` | — | Optional complete connection string used only by Docker. |
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
pnpm version:show   # Show version.json
pnpm version:patch  # Increment patch version
pnpm version:minor  # Increment minor version
pnpm version:major  # Increment major version
```

`version.json` is the single version source for the setup script, frontend footer, and Docker build. The version commands update that file using semantic versioning.

Production-style local run:

```powershell
pnpm build
pnpm server
```

Then open <http://localhost:3001>.

## Docker deployment

The project includes a single multi-stage image and a one-service Compose file. The container serves the built frontend and Express API together on port `9200`:

```powershell
docker compose up --build -d
```

Open <http://localhost:9200>.

By default, the container connects to the host SQL Server through `tcp:host.docker.internal,1433` and uses the `COSEC` database. SQL Server TCP/IP must be enabled and port 1433 must be reachable from Docker. To point it at another SQL Server, set these values before starting Compose:

```powershell
$env:DOCKER_DB_SERVER = 'host.docker.internal,1433'
$env:DB_DATABASE = 'COSEC'
docker compose up --build -d
```

If the database requires an ODBC connection-string override, set `DB_CONNECTION_STRING` in the Compose environment. The connection string must be reachable from inside the container and should use SQL authentication or another authentication method available to the container. Windows integrated authentication from the host is not automatically forwarded into a Linux container.

Stop the service with:

```powershell
docker compose down
```

## API endpoints

### Daily attendance

```text
GET /api/attendance
```

Supported query parameters:

- `startDate=YYYY-MM-DD`
- `endDate=YYYY-MM-DD`
- `date=YYYY-MM-DD` (backward-compatible single-day shortcut)
- `page=1`
- `pageSize=10`
- `location=All|Dubai|India`
- `search=name-or-user-id`
- `tab=all|late|early|underEight`

When both date filters are omitted, the API selects the latest available biometric date and uses it for both boundaries. If only one boundary is provided, the API uses that date for the other boundary.

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
