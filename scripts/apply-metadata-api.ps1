#!/usr/bin/env pwsh
# apply-metadata-api.ps1
# Applies Hasura metadata directly via the REST API (no Hasura CLI required).
# Reads credentials from .env to avoid shell escaping issues with special chars.

$ErrorActionPreference = "Stop"

# ── Load .env ────────────────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot "..\\.env"
$envVars = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $parts = $line.Split("=", 2)
      $key = $parts[0].Trim()
      $val = $parts[1].Trim()
      $envVars[$key] = $val
    }
  }
}

$Endpoint    = "https://puwxmgwnewcpwjizqfqb.hasura.ap-south-1.nhost.run"
$AdminSecret = $envVars["HASURA_GRAPHQL_ADMIN_SECRET"]
if (-not $AdminSecret) { $AdminSecret = $envVars["NHOST_ADMIN_SECRET"] }
Write-Host "Loaded admin secret (length=$($AdminSecret.Length))"

$ErrorActionPreference = "Stop"

$headers = @{
  "X-Hasura-Admin-Secret" = $AdminSecret
  "Content-Type"          = "application/json"
}

Write-Host "=== Hasura Metadata Apply (API mode) ===" -ForegroundColor Cyan
Write-Host "Endpoint: $Endpoint"

# ── Step 1: Export current metadata (to check connectivity) ──────────────────
Write-Host "`n[1/3] Testing connectivity / exporting current metadata..."
try {
  $exportBody = '{"type":"export_metadata","args":{}}'
  $exportResp = Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
    -Method Post -Headers $headers -Body $exportBody
  Write-Host "Connected. Metadata version: $($exportResp.version)" -ForegroundColor Green
} catch {
  Write-Error "Cannot reach Hasura endpoint. Check ENDPOINT and ADMIN_SECRET.`n$_"
}

# ── Step 2: Reload metadata (forces Hasura to re-read DB schema) ─────────────
Write-Host "`n[2/3] Reloading metadata..."
$reloadBody = '{"type":"reload_metadata","args":{"reload_remote_schemas":true,"reload_sources":true}}'
$reloadResp = Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $reloadBody
Write-Host "Reload response: $($reloadResp | ConvertTo-Json -Compress)" -ForegroundColor Green

# ── Step 3: Apply table permissions via replace_metadata ─────────────────────
# We use the pg_drop_table_permissions + pg_create_* APIs for each table
# to surgically fix the duplicate permission problem without replacing all metadata.

$tablesWithFixes = @(
  @{
    table  = "workflow_steps"
    schema = "public"
  }
  @{
    table  = "workflow_triggers"
    schema = "public"
  }
)

foreach ($t in $tablesWithFixes) {
  $tbl = $t.table
  $sch = $t.schema

  Write-Host "`n[3/3] Fixing permissions on $sch.$tbl ..." -ForegroundColor Yellow

  # Drop all existing user-role permissions first (idempotent)
  foreach ($permType in @("insert","update","delete")) {
    $dropBody = @{
      type = "pg_drop_${permType}_permission"
      args = @{
        source = "default"
        table  = @{ schema = $sch; name = $tbl }
        role   = "user"
      }
    } | ConvertTo-Json -Depth 10

    try {
      Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
        -Method Post -Headers $headers -Body $dropBody | Out-Null
      Write-Host "  Dropped $permType permission on $tbl" -ForegroundColor Gray
    } catch {
      # Permission may not exist yet — that's fine
      Write-Host "  (No existing $permType permission to drop on $tbl)" -ForegroundColor Gray
    }
  }
}

# ── Recreate insert permission for workflow_steps ────────────────────────────
Write-Host "`nRecreating insert permission for workflow_steps..." -ForegroundColor Yellow
$body = @{
  type = "pg_create_insert_permission"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "workflow_steps" }
    role   = "user"
    permission = @{
      columns = @("workflow_id","position","name","type","config")
      check   = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
    }
  }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $body | Out-Null
Write-Host "  Insert permission created for workflow_steps" -ForegroundColor Green

# ── Recreate update permission for workflow_steps ────────────────────────────
Write-Host "Recreating update permission for workflow_steps..." -ForegroundColor Yellow
$body = @{
  type = "pg_create_update_permission"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "workflow_steps" }
    role   = "user"
    permission = @{
      columns = @("position","name","type","config")
      filter  = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
      check   = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
    }
  }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $body | Out-Null
Write-Host "  Update permission created for workflow_steps" -ForegroundColor Green

# ── Recreate delete permission for workflow_steps ────────────────────────────
Write-Host "Recreating delete permission for workflow_steps..." -ForegroundColor Yellow
$body = @{
  type = "pg_create_delete_permission"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "workflow_steps" }
    role   = "user"
    permission = @{
      filter = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
    }
  }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $body | Out-Null
Write-Host "  Delete permission created for workflow_steps" -ForegroundColor Green

# ── Recreate insert permission for workflow_triggers ─────────────────────────
Write-Host "`nRecreating insert permission for workflow_triggers..." -ForegroundColor Yellow
$body = @{
  type = "pg_create_insert_permission"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "workflow_triggers" }
    role   = "user"
    permission = @{
      columns = @("workflow_id","type","config","enabled")
      check   = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
    }
  }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $body | Out-Null
Write-Host "  Insert permission created for workflow_triggers" -ForegroundColor Green

# ── Recreate update permission for workflow_triggers ─────────────────────────
Write-Host "Recreating update permission for workflow_triggers..." -ForegroundColor Yellow
$body = @{
  type = "pg_create_update_permission"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "workflow_triggers" }
    role   = "user"
    permission = @{
      columns = @("type","config","enabled")
      filter  = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
      check   = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
    }
  }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $body | Out-Null
Write-Host "  Update permission created for workflow_triggers" -ForegroundColor Green

# ── Recreate delete permission for workflow_triggers ─────────────────────────
Write-Host "Recreating delete permission for workflow_triggers..." -ForegroundColor Yellow
$body = @{
  type = "pg_create_delete_permission"
  args = @{
    source = "default"
    table  = @{ schema = "public"; name = "workflow_triggers" }
    role   = "user"
    permission = @{
      filter = @{
        workflow = @{
          organization = @{
            org_members = @{
              "_and" = @(
                @{ user_id = @{ "_eq" = "X-Hasura-User-Id" } },
                @{ role    = @{ "_in" = @("owner","editor") } }
              )
            }
          }
        }
      }
    }
  }
} | ConvertTo-Json -Depth 20

Invoke-RestMethod -Uri "$Endpoint/v1/metadata" `
  -Method Post -Headers $headers -Body $body | Out-Null
Write-Host "  Delete permission created for workflow_triggers" -ForegroundColor Green

Write-Host "`n✅ All permissions applied successfully via API." -ForegroundColor Cyan
