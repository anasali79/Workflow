#Requires -Version 5.1
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OrgAOwner,
  [string]$OrgAEditor,
  [string]$OrgAViewer,
  [string]$OrgBOwner,
  [string]$OrgBEditor,
  [switch]$UsePlaceholders
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
  Write-Error "DATABASE_URL is required."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Error "psql is required."
}

if ($UsePlaceholders) {
  $seed = Join-Path $Root "database\seeds\demo_seed_with_placeholder_users.sql"
  Write-Host "Seeding with placeholder user UUIDs..."
  & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $seed
  exit $LASTEXITCODE
}

$sets = @()
if ($OrgAOwner)  { $sets += "app.demo_org_a_owner=$OrgAOwner" }
if ($OrgAEditor) { $sets += "app.demo_org_a_editor=$OrgAEditor" }
if ($OrgAViewer) { $sets += "app.demo_org_a_viewer=$OrgAViewer" }
if ($OrgBOwner)  { $sets += "app.demo_org_b_owner=$OrgBOwner" }
if ($OrgBEditor) { $sets += "app.demo_org_b_editor=$OrgBEditor" }

$seed = Join-Path $Root "database\seeds\demo_seed.sql"
Write-Host "Seeding demo data..."

if ($sets.Count -gt 0) {
  $setArgs = @()
  foreach ($s in $sets) { $setArgs += @("-c", "SELECT set_config('$($s.Split('=')[0])', '$($s.Split('=')[1])', false);") }
  # Apply GUCs then seed in one session
  $gucSql = ($sets | ForEach-Object {
    $parts = $_.Split('=', 2)
    "SELECT set_config('$($parts[0])', '$($parts[1])', false);"
  }) -join "`n"
  $tmp = Join-Path $env:TEMP "workflow-demo-seed-$(Get-Random).sql"
  @"
$gucSql
\i $(($seed -replace '\\','/'))
"@ | Set-Content -Path $tmp -Encoding UTF8
  & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $tmp
  Remove-Item $tmp -Force
} else {
  Write-Host "No member UUIDs provided — orgs/workflow will seed; members skipped."
  & psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $seed
}

exit $LASTEXITCODE
