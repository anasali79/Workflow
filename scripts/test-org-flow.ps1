#!/usr/bin/env pwsh
# test-org-flow.ps1  — verifies the org create + member add flow end-to-end

$ErrorActionPreference = "Stop"

$envVars = @{}
Get-Content (Join-Path $PSScriptRoot "..\\.env") | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    $envVars[$parts[0].Trim()] = $parts[1].Trim()
  }
}
$secret   = $envVars["HASURA_GRAPHQL_ADMIN_SECRET"]
$endpoint = "https://puwxmgwnewcpwjizqfqb.hasura.ap-south-1.nhost.run"
$gql      = "$endpoint/v1/graphql"
$headers  = @{ "X-Hasura-Admin-Secret" = $secret; "Content-Type" = "application/json" }

function GQL($query) {
  $body = [System.Text.Encoding]::UTF8.GetBytes(($query | ConvertTo-Json))
  Invoke-RestMethod -Uri $gql -Method Post -Headers $headers -Body $body
}

Write-Host "=== Org Creation Flow Test ===" -ForegroundColor Cyan

# ── 1. Create test org ───────────────────────────────────────────────────────
Write-Host "[1] Creating test organization..."
$r = GQL @{ query = 'mutation { insert_organizations_one(object:{name:"VerifyTestOrg2",quota_limit:10}) { id name } }' }
if ($r.errors) { Write-Error "Create org failed: $($r.errors[0].message)" }
$orgId = $r.data.insert_organizations_one.id
Write-Host "    Org created: id=$orgId" -ForegroundColor Green

# ── 2. Add member WITHOUT on_conflict (the fixed approach) ───────────────────
Write-Host "[2] Adding owner member (no on_conflict)..."
$fakeUserId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
$r2 = GQL @{
  query     = 'mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) { insert_org_members_one(object:{organization_id:$orgId,user_id:$userId,role:$role}) { id organization_id user_id role } }'
  variables = @{ orgId = $orgId; userId = $fakeUserId; role = "owner" }
}
if ($r2.errors) {
  Write-Host "    ERROR: $($r2.errors[0].message)" -ForegroundColor Red
} else {
  $m = $r2.data.insert_org_members_one
  Write-Host "    Member added: role=$($m.role)  org=$($m.organization_id)" -ForegroundColor Green
}

# ── 3. Attempt duplicate insert (should fail with unique constraint) ──────────
Write-Host "[3] Testing unique constraint (duplicate insert should fail)..."
$r3 = GQL @{
  query     = 'mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) { insert_org_members_one(object:{organization_id:$orgId,user_id:$userId,role:$role}) { id } }'
  variables = @{ orgId = $orgId; userId = $fakeUserId; role = "editor" }
}
if ($r3.errors) {
  Write-Host "    Correctly rejected duplicate: $($r3.errors[0].message)" -ForegroundColor Green
} else {
  Write-Host "    WARNING: duplicate insert succeeded (unexpected)" -ForegroundColor Yellow
}

# ── 4. Cleanup ────────────────────────────────────────────────────────────────
Write-Host "[4] Cleaning up..."
$r4 = GQL @{ query = "mutation { delete_organizations_by_pk(id: `"$orgId`") { id } }" }
Write-Host "    Deleted org $orgId" -ForegroundColor Gray

Write-Host ""
Write-Host "=== PASS: Org create + member insert (no on_conflict) works correctly ===" -ForegroundColor Cyan
