#Requires -Version 5.1
param(
  [string]$Endpoint = $env:HASURA_GRAPHQL_ENDPOINT,
  [string]$AdminSecret = $env:HASURA_GRAPHQL_ADMIN_SECRET
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

if (-not $Endpoint) { $Endpoint = [System.Environment]::GetEnvironmentVariable("HASURA_GRAPHQL_ENDPOINT") }
if (-not $AdminSecret) { $AdminSecret = [System.Environment]::GetEnvironmentVariable("HASURA_GRAPHQL_ADMIN_SECRET") }

Set-Location (Join-Path $Root "hasura")

if (-not (Get-Command hasura -ErrorAction SilentlyContinue)) {
  Write-Error "Hasura CLI required. Install from https://hasura.io/docs/latest/hasura-cli/install-hasura-cli/"
}

if (-not $Endpoint) { $Endpoint = "http://localhost:8080" }

$args = @("--endpoint", $Endpoint)
if ($AdminSecret) { $args += @("--admin-secret", $AdminSecret) }

Write-Host "Applying Hasura migrations..."
& hasura migrate apply --database-name default @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Applying Hasura metadata..."
& hasura metadata apply @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Reloading metadata..."
& hasura metadata reload @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done."
