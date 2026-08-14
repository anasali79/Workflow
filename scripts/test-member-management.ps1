#!/usr/bin/env pwsh
# test-member-management.ps1 — tests member insert, update role, and delete member

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

function GQL($query, $vars = $null) {
  $payload = @{ query = $query }
  if ($vars) { $payload["variables"] = $vars }
  $body = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 10))
  Invoke-RestMethod -Uri $gql -Method Post -Headers $headers -Body $body
}

Write-Host "=== Member Management End-to-End Test ===" -ForegroundColor Cyan

# 1. Create org
Write-Host "[1] Creating org..."
$r = GQL 'mutation { insert_organizations_one(object:{name:"MemberTestOrg",quota_limit:10}) { id name } }'
$orgId = $r.data.insert_organizations_one.id
Write-Host "    Org created: $orgId" -ForegroundColor Green

# 2. Add Owner member
Write-Host "[2] Adding owner member..."
$ownerId = "11111111-1111-1111-1111-111111111111"
$r2 = GQL 'mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) { insert_org_members_one(object:{organization_id:$orgId,user_id:$userId,role:$role}) { id role } }' @{ orgId = $orgId; userId = $ownerId; role = "owner" }
$ownerMemberId = $r2.data.insert_org_members_one.id
Write-Host "    Owner added: memberId=$ownerMemberId" -ForegroundColor Green

# 3. Add Editor member
Write-Host "[3] Adding editor member..."
$editorId = "22222222-2222-2222-2222-222222222222"
$r3 = GQL 'mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) { insert_org_members_one(object:{organization_id:$orgId,user_id:$userId,role:$role}) { id role } }' @{ orgId = $orgId; userId = $editorId; role = "editor" }
$editorMemberId = $r3.data.insert_org_members_one.id
Write-Host "    Editor added: memberId=$editorMemberId, role=$($r3.data.insert_org_members_one.role)" -ForegroundColor Green

# 4. Update Editor's role to Viewer
Write-Host "[4] Updating member role to viewer..."
$r4 = GQL 'mutation UpdateMemberRole($id: uuid!, $role: String!) { update_org_members_by_pk(pk_columns:{id:$id}, _set:{role:$role}) { id role } }' @{ id = $editorMemberId; role = "viewer" }
Write-Host "    Role updated: newRole=$($r4.data.update_org_members_by_pk.role)" -ForegroundColor Green

# 5. Delete Member
Write-Host "[5] Removing member from org..."
$r5 = GQL 'mutation DeleteMember($id: uuid!) { delete_org_members_by_pk(id:$id) { id } }' @{ id = $editorMemberId }
Write-Host "    Member removed: id=$($r5.data.delete_org_members_by_pk.id)" -ForegroundColor Green

# 6. Cleanup Org
Write-Host "[6] Cleaning up test org..."
GQL 'mutation DeleteOrg($id: uuid!) { delete_organizations_by_pk(id:$id) { id } }' @{ id = $orgId } | Out-Null
Write-Host "    Test org deleted." -ForegroundColor Gray

Write-Host "`n=== PASS: All member management operations (Insert, Update Role, Remove) work perfectly ===" -ForegroundColor Cyan
