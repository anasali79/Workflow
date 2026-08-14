#!/usr/bin/env pwsh
# verify-metadata.ps1
# Verifies Hasura metadata is consistent and tests org creation flow via GraphQL.

$ErrorActionPreference = "Stop"

# Load .env
$envFile = Join-Path $PSScriptRoot "..\\.env"
$envVars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    $envVars[$parts[0].Trim()] = $parts[1].Trim()
  }
}

$Endpoint    = "https://puwxmgwnewcpwjizqfqb.hasura.ap-south-1.nhost.run"
$AdminSecret = $envVars["HASURA_GRAPHQL_ADMIN_SECRET"]

$headers = @{
  "X-Hasura-Admin-Secret" = $AdminSecret
  "Content-Type"          = "application/json"
}

Write-Host "=== Hasura Metadata Verification ===" -ForegroundColor Cyan

# ── 1. Check metadata consistency ────────────────────────────────────────────
Write-Host "`n[1] Checking metadata consistency..."
$body = '{"type":"get_inconsistent_metadata","args":{}}'
$resp = Invoke-RestMethod -Uri "$Endpoint/v1/metadata" -Method Post -Headers $headers -Body $body
$inconsistentCount = ($resp.inconsistent_objects | Measure-Object).Count

if ($inconsistentCount -eq 0) {
  Write-Host "  ✅ Metadata is fully consistent (0 inconsistent objects)" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  $inconsistentCount inconsistent objects found:" -ForegroundColor Yellow
  $resp.inconsistent_objects | ForEach-Object {
    Write-Host "    - $($_.name): $($_.reason)" -ForegroundColor Yellow
  }
}

# ── 2. Check org_members permissions ─────────────────────────────────────────
Write-Host "`n[2] Verifying org_members permission setup..."
$body = @{
  type = "pg_get_table_info"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "org_members" }
  }
} | ConvertTo-Json -Depth 5

try {
  $resp = Invoke-RestMethod -Uri "$Endpoint/v1/metadata" -Method Post -Headers $headers -Body $body
  Write-Host "  ✅ org_members table info retrieved" -ForegroundColor Green
} catch {
  Write-Host "  ℹ️  pg_get_table_info not available in this Hasura version (normal)" -ForegroundColor Gray
}

# ── 3. Test GraphQL schema for org_members_update_column enum ─────────────────
Write-Host "`n[3] Testing GraphQL schema for org_members_update_column enum..."
$introspectBody = @{
  query = @"
{
  __type(name: "org_members_update_column") {
    name
    enumValues { name }
  }
}
"@
} | ConvertTo-Json

try {
  $resp = Invoke-RestMethod -Uri "$Endpoint/v1/graphql" `
    -Method Post -Headers $headers -Body $introspectBody
  $enumVals = $resp.data.__type.enumValues.name
  Write-Host "  org_members_update_column enum values: $($enumVals -join ', ')" -ForegroundColor Cyan
  if ($enumVals -contains "role") {
    Write-Host "  ✅ 'role' is in the enum — update_columns: [role] will work" -ForegroundColor Green
  } elseif ($enumVals -contains "_PLACEHOLDER") {
    Write-Host "  ⚠️  Only '_PLACEHOLDER' found — update_permissions may not be set correctly" -ForegroundColor Yellow
  } else {
    Write-Host "  ℹ️  Enum values: $($enumVals -join ', ')" -ForegroundColor Gray
  }
} catch {
  Write-Host "  Error: $_" -ForegroundColor Red
}

# ── 4. Test workflow_steps insert enum columns ────────────────────────────────
Write-Host "`n[4] Checking workflow_steps_insert_input type..."
$introspectBody = @{
  query = @"
{
  __type(name: "workflow_steps_insert_input") {
    name
    inputFields { name }
  }
}
"@
} | ConvertTo-Json

$resp = Invoke-RestMethod -Uri "$Endpoint/v1/graphql" `
  -Method Post -Headers $headers -Body $introspectBody
$fields = $resp.data.__type.inputFields.name
Write-Host "  workflow_steps_insert_input fields: $($fields -join ', ')" -ForegroundColor Cyan

Write-Host "`n✅ Verification complete." -ForegroundColor Cyan
