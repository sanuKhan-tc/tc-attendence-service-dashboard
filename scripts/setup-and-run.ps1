[CmdletBinding()]
param(
  [string]$SqlServer = 'localhost',
  [string]$Database = 'COSEC',
  [string]$ReadUser = 'tc_attendance_reader'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required but was not found in PATH."
  }
}

if ($ReadUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw 'ReadUser must contain only letters, numbers, and underscores, and cannot start with a number.'
}

if ($Database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
  throw 'Database must contain only letters, numbers, and underscores, and cannot start with a number.'
}

$envPath = Join-Path $repoRoot '.env'
if (-not (Test-Path $envPath)) {
  Require-Command 'sqlcmd'

  $securePassword = Read-Host "Enter the SQL password for $ReadUser" -AsSecureString
  $readPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
  $confirmSecurePassword = Read-Host 'Confirm the SQL password' -AsSecureString
  $confirmPassword = [System.Net.NetworkCredential]::new('', $confirmSecurePassword).Password

  if ([string]::IsNullOrWhiteSpace($readPassword)) {
    throw 'SQL password cannot be empty.'
  }

  if ($readPassword -cne $confirmPassword) {
    throw 'SQL passwords do not match.'
  }

  $sqlPassword = $readPassword.Replace("'", "''")
  $sql = @'
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(SqlUser)')
BEGIN
  CREATE LOGIN [$(SqlUser)] WITH PASSWORD = N'$(SqlPassword)', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
  PRINT 'Created SQL login.';
END
ELSE
BEGIN
  PRINT 'SQL login already exists.';
END;

USE [$(SqlDatabase)];

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(SqlUser)')
BEGIN
  CREATE USER [$(SqlUser)] FOR LOGIN [$(SqlUser)] WITH DEFAULT_SCHEMA = [dbo];
  PRINT 'Created database user.';
END
ELSE
BEGIN
  PRINT 'Database user already exists.';
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.database_role_members AS drm
  INNER JOIN sys.database_principals AS role_principal ON role_principal.principal_id = drm.role_principal_id
  INNER JOIN sys.database_principals AS member_principal ON member_principal.principal_id = drm.member_principal_id
  WHERE role_principal.name = N'db_datareader'
    AND member_principal.name = N'$(SqlUser)'
)
BEGIN
  ALTER ROLE [db_datareader] ADD MEMBER [$(SqlUser)];
  PRINT 'Granted read-only database access.';
END
ELSE
BEGIN
  PRINT 'Read-only database access already exists.';
END;
'@

  & sqlcmd -S $SqlServer -E -C -b -d master -v "SqlUser=$ReadUser" "SqlPassword=$sqlPassword" "SqlDatabase=$Database" -Q $sql
  if ($LASTEXITCODE -ne 0) {
    throw 'SQL read-user setup failed. Confirm Windows authentication has permission to create logins/users.'
  }

  Copy-Item (Join-Path $repoRoot '.env.example') $envPath
  $envPassword = $readPassword.Replace('"', '\"')
  Add-Content -Path $envPath -Value "`nDOCKER_DB_USER=$ReadUser`nDOCKER_DB_PASSWORD=`"$envPassword`""
  Write-Host "Created .env with Docker SQL credentials for $ReadUser." -ForegroundColor Green
}
else {
  Write-Host '.env already installed; leaving it unchanged.' -ForegroundColor Yellow
}

Require-Command 'docker'
Write-Host 'Building and starting the attendance dashboard on port 9200...' -ForegroundColor Cyan
& docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to build or start the dashboard.'
}

Write-Host 'Dashboard is running at http://localhost:9200' -ForegroundColor Green
