[CmdletBinding()]
param(
  [string]$SqlServer,
  [string]$Database,
  [string]$ReadUser
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required but was not found in PATH."
  }
}

function Read-EnvValues([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return ,$values }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
      $key = $matches[1]
      $value = $matches[2].Trim()
      if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2).Replace('\"', '"')
      }
      $values[$key] = $value
    }
  }

  return ,$values
}

function New-SqlPassword {
  $bytes = New-Object byte[] 24
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return "R!a7$([Convert]::ToBase64String($bytes).TrimEnd('='))"
}

Require-Command 'git'
Write-Host 'Pulling latest updates...' -ForegroundColor Cyan
& git pull --ff-only
if ($LASTEXITCODE -ne 0) {
  throw 'Git pull failed. Commit or stash local tracked changes before restarting.'
}
Write-Host 'Latest updates pulled.' -ForegroundColor Green

$versionPath = Join-Path $repoRoot 'version.json'
if (-not (Test-Path $versionPath)) {
  throw 'version.json was not found.'
}

$versionInfo = Get-Content -Path $versionPath -Raw | ConvertFrom-Json
$appVersion = [string]$versionInfo.version
if ($appVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
  throw 'version.json must contain a valid semantic version.'
}
Write-Host "Application version: $appVersion" -ForegroundColor Cyan

$envPath = Join-Path $repoRoot '.env'
$envValues = Read-EnvValues $envPath
if (-not $PSBoundParameters.ContainsKey('SqlServer')) {
  $SqlServer = if ($envValues.ContainsKey('DB_SERVER') -and $envValues.DB_SERVER) { $envValues.DB_SERVER } else { 'localhost' }
}
if (-not $PSBoundParameters.ContainsKey('Database')) {
  $Database = if ($envValues.ContainsKey('DB_DATABASE') -and $envValues.DB_DATABASE) { $envValues.DB_DATABASE } else { 'COSEC' }
}
if (-not $PSBoundParameters.ContainsKey('ReadUser')) {
  $ReadUser = if ($envValues.ContainsKey('DOCKER_DB_USER') -and $envValues.DOCKER_DB_USER) { $envValues.DOCKER_DB_USER } else { 'tc_attendance_reader' }
}

Require-Command 'node'
& node scripts/generate-changelog.mjs
if ($LASTEXITCODE -ne 0) {
  throw 'Changelog generation failed.'
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

  $readPassword = New-SqlPassword
  $sqlPassword = $readPassword.Replace("'", "''")
  $sql = @'
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(SqlUser)')
BEGIN
  CREATE LOGIN [$(SqlUser)] WITH PASSWORD = N'$(SqlPassword)', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
  PRINT 'Created SQL login.';
END
ELSE
BEGIN
  ALTER LOGIN [$(SqlUser)] WITH PASSWORD = N'$(SqlPassword)';
  PRINT 'Reset SQL login password.';
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
  Write-Host "Created .env with generated Docker SQL credentials for $ReadUser." -ForegroundColor Green
}
else {
  if (-not $envValues.ContainsKey('DOCKER_DB_USER') -or [string]::IsNullOrWhiteSpace($envValues.DOCKER_DB_USER)) {
    throw '.env must define DOCKER_DB_USER.'
  }
  if (-not $envValues.ContainsKey('DOCKER_DB_PASSWORD') -or [string]::IsNullOrWhiteSpace($envValues.DOCKER_DB_PASSWORD)) {
    throw '.env must define DOCKER_DB_PASSWORD.'
  }
  Write-Host '.env already installed; leaving its credentials unchanged.' -ForegroundColor Yellow
}

Require-Command 'docker'
Write-Host 'Building and starting the attendance dashboard on port 9200...' -ForegroundColor Cyan
& docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to build or start the dashboard.'
}

Write-Host 'Dashboard is running at http://localhost:9200' -ForegroundColor Green
