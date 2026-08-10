#Requires -Version 5.1
param(
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$EnvPath = Join-Path $Root ".env"
if (Test-Path $EnvPath) {
  Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      $key = $parts[0].Trim()
      $val = $parts[1].Trim().Trim('"').Trim("'")
      if ($key -and -not [System.Environment]::GetEnvironmentVariable($key)) {
        [System.Environment]::SetEnvironmentVariable($key, $val)
      }
    }
  }
}

if (-not $DatabaseUrl) {
  $DatabaseUrl = [System.Environment]::GetEnvironmentVariable("DATABASE_URL")
}

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL is required (Nhost Postgres connection string)."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Error "psql is required. Install PostgreSQL client tools or use Docker (see docs/database.md)."
}

$migrations = @(
  Join-Path $Root "database\migrations\001_initial_schema.sql"
  Join-Path $Root "database\migrations\002_views_and_functions.sql"
)

Write-Host "Applying database/migrations in order..."
foreach ($file in $migrations) {
  Write-Host " -> $(Split-Path $file -Leaf)"
  & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Verifying schema..."
& psql $DatabaseUrl -v ON_ERROR_STOP=1 -f (Join-Path $Root "database\scripts\verify_schema.sql")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done."
