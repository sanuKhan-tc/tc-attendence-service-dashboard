#DB Schema and dashboard recommendations

## Main data flow

```text
Door/biometric devices
        ↓
Mx_ATDEventTrn          Raw attendance/access events
        ↓
Mx_DATDTrn              One calculated attendance row per user/day
        ↓
Reporting/API views     Dashboard-friendly projections
```

## Important tables

| Table | Purpose | Current size |
|---|---|---:|
| `Mx_ATDEventTrn` | Raw allowed/denied door and biometric events | 1,621,850 |
| `Mx_DATDTrn` | Daily attendance calculation per user | 145,097 |
| `Mx_UserMst` | Employees/users and their settings | 707 |
| `Mx_SDCCfg` | Door/biometric controller configuration | 16 |
| `Mx_DoorControllerDet` | Panel/controller door configuration | 255 |
| `Mx_DoorCommon` | Door identifiers and mappings | 12 relevant doors |
| `Mx_EventMst` | Event code descriptions | 141 |
| `Mx_OfflineDoor` | Device offline/online episodes | 27,803 |
| `Mx_ATDSUMTrn` | Monthly attendance summaries | 695 |
| `Mx_ATDSALSUMTrn` | Monthly attendance/payroll summaries | 695 |
| `Mx_UserFaceTemplate` | Face biometric templates | 1,165 |

## Raw events: `Mx_ATDEventTrn`

This is the most important table for a live access-event dashboard.

Important fields:

- `Edatetime`: event timestamp from the device
- `IDateTime`: insertion/processing timestamp
- `UserID`: employee identifier
- `EventID`: event meaning
- `IOType`: numeric entry/exit direction
- `Type`: device/panel type
- `MID`: controller/device ID
- `DID`: door ID
- `SiteID`: site identifier
- `ProcFlg`: processing flag
- `EvtSource`: event source
- `PunchReason`: manual or special reason
- GPS/location fields where applicable

Data range:

- First event: March 8, 2022
- Latest event: October 12, 2026
- All observed events belong to `SiteID = 1`

Observed event types:

| Event ID | Meaning | Rows |
|---:|---|---:|
| 101 | Allowed | 1,620,114 |
| 154 | Denied - Time Out | 824 |
| 165 | Denied - Invalid Route Access | 698 |
| 157 | Denied - Disabled User | 192 |
| 175 | Denied - Face Recognition Disabled | 22 |

Observed `IOType` values are `0`, `1`, and `9`. I would preserve these as numeric values until the exact device-specific meaning of `0/1` is confirmed.

## Daily attendance: `Mx_DATDTrn`

Use this for attendance summaries, not raw events.

It contains one row per user/date and includes:

- `UserID`
- `PDate`
- `Punch1` through `Punch12`
- `OutPunch`
- `WorkTime`
- `NetWorkTime`
- `LateIn`
- `EarlyOut`
- `Overtime`
- `LunchBreak`
- `RHalf1`, `RHalf2`
- `SchSFT`, `WrkSFT`
- leave, authorization, correction, and approval fields
- controller/door metadata for each punch

The numeric duration fields are minutes. Existing views convert them to `HH:MM`.

Current attendance data:

- 145,097 user-day rows
- 559 distinct users
- 1,444 attendance dates
- October 13, 2026 is the latest attendance date
- 61,134 rows have no `Punch1`
- 61,019 rows have no `OutPunch`

Those missing punches are not automatically errors because the table also contains absence, week-off, holiday, and half-day statuses.

Observed status values include:

- `PR`: present
- `AB`: absent
- `WO`: week off
- `IN`: incomplete/in-progress-looking status

For attendance, use `RHalf1`, `RHalf2`, `SchSTAT`, `Punch1`, `OutPunch`, and `WorkTime` together.

## Users: `Mx_UserMst`

There are 707 user records.

Observed user flags:

- 189 enabled users
- 180 enabled users with attendance calculation enabled
- 559 users appear in daily attendance records

This table contains a lot of sensitive information, including:

- biometric-related fields
- passwords/tokens
- phone numbers and emails
- government IDs
- addresses
- medical and personal information

For the dashboard, only select fields such as:

```text
UserID
Name
FullName
IntegrationRef
UserType
UserIDEnbl
ATDCalcEnbl
ORGID
BRCID
DPTID
DSGID
```

Never use `SELECT *` from this table.

## Devices and locations

There is:

- 1 site: `Site-1`
- 4 branches: Branch-1, Noida, Hyderabad, and tc-Chennai
- 1 panel controller with 3 doors
- 9 non-deleted SDC controllers
- 12 visible door/device records in `Mx_VEW_DoorDetail`

Device names include:

- Main Door -114
- Main Door-113
- Main Door-214
- Main Door -116
- TC-Hyderabad
- TC-Noida
- techcarrot-Cafeteria
- TA-tc Dubai-Device-1
- TC-Chennai

Important distinction:

- `BRCID` is the employee’s branch.
- `MID/DID` and `DeviceName` identify the physical door/device.
- `SiteID` is not useful for location separation here because all observed events use site 1.

For a location dashboard, use the physical device/door mapping rather than `SiteID`.

## Existing views worth using

These views already contain business joins and calculated fields:

- `Mx_VEW_UserAttendanceEvents`
  Raw attendance events enriched with employee and device information.

- `Mx_VEW_UserAccessCtrlEvts`
  Access-control events from `Mx_ACSEventTrn`, but that table currently contains only 8 rows.

- `Mx_VEW_DailyAttendance`
  Daily attendance with punches, work time, late/early values, overtime, shift, branch, department, and door metadata.

- `Mx_VEW_FirstAndLastAtdEvts`
  Calculates the first and last event per user/day and labels them with `IOFlag = I/O`.

- `Mx_VEW_APIDailyAttendance`
  API-oriented daily attendance view, but it exposes many fields and may include event-photo data.

- `Mx_VEW_APIMonthlyAtdSumry`
  Monthly attendance summary view.

The existing views use `INNER JOIN`s to many lookup tables, so records with missing lookup references may disappear from the view.

## Recommended simple dashboard

### 1. Overview

Use `Mx_DATDTrn`:

- present users
- absent users
- incomplete attendance
- late arrivals
- missing checkout
- total work hours
- overtime
- selected date/site/branch filters

### 2. Attendance table

Use `Mx_DATDTrn` joined to `Mx_UserMst`:

- employee
- branch/department
- date
- first punch
- last punch
- work time
- late minutes
- overtime
- attendance status

### 3. Live event feed

Use `Mx_ATDEventTrn` joined to:

- `Mx_EventMst`
- `Mx_UserMst`
- `Mx_VEW_DoorDetail`

Show:

- event time
- employee
- allowed/denied status
- device/door
- entry/exit numeric value
- reason

Do not count every raw event as a person present. One person can generate multiple events in a day.

### 4. Device health

Use:

- `Mx_OfflineDoor`
- `Mx_VEW_DoorDetail`
- `Mx_SDCCfg`

Show:

- device name
- last offline time
- last recovery time
- number of outage episodes
- open episodes with no `OnlineDate`

There are six offline records without a recorded recovery time, but these should be verified before labeling devices currently offline.

## Important freshness issue

The database currently appears stale:

- Latest raw event: October 12, 2026
- Latest daily attendance date: October 13, 2026
- Current date: November 19, 2026

The dashboard should show a prominent “last data received” timestamp instead of assuming that the latest database date is today.

## Recommended first implementation

For the first dashboard version, I would use:

```text
Attendance summary:   Mx_DATDTrn
Employee details:     Mx_UserMst
Live access feed:     Mx_ATDEventTrn
Event descriptions:   Mx_EventMst
Door names:           Mx_VEW_DoorDetail
Device health:        Mx_OfflineDoor
Monthly summaries:    Mx_ATDSUMTrn or Mx_ATDSALSUMTrn
```

The database has no declared foreign keys, so joins are enforced by application conventions. The dashboard queries should therefore use explicit joins and avoid assuming that every identifier has a valid lookup record.

Skipped: I did not read biometric template contents or expose personal employee data. Risk: `CurrentStatus`/`Active` device flags appear inconsistent, so device health should be based on offline history and fresh event timestamps until verified.