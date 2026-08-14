#!/usr/bin/env pwsh
# Seed Demo Run Data into Hasura DB
# Usage: .\scripts\seed-demo-runs.ps1

$HASURA_ENDPOINT = "http://localhost:1337/v1/graphql"
$ADMIN_SECRET = "nhost-admin-secret"

function Invoke-Hasura($query, $variables = @{}) {
    $body = @{
        query     = $query
        variables = $variables
    } | ConvertTo-Json -Depth 10

    try {
        $response = Invoke-RestMethod -Uri $HASURA_ENDPOINT -Method POST `
            -Headers @{
                "Content-Type"          = "application/json"
                "x-hasura-admin-secret" = $ADMIN_SECRET
            } `
            -Body $body

        if ($response.errors) {
            Write-Warning ("GraphQL Error: " + ($response.errors | ConvertTo-Json))
            return $null
        }
        return $response.data
    } catch {
        Write-Warning "Request failed: $_"
        return $null
    }
}

Write-Host "Seeding demo run data..." -ForegroundColor Cyan

# 1. Get the first org
$orgsData = Invoke-Hasura "query { organizations(limit: 1) { id name } }"
if (-not $orgsData -or $orgsData.organizations.Count -eq 0) {
    Write-Error "No organizations found. Please create one first via the UI."
    exit 1
}
$org = $orgsData.organizations[0]
Write-Host "  Using org: $($org.name) ($($org.id))" -ForegroundColor Yellow

# 2. Get workflows for the org
$wfData = Invoke-Hasura "query { workflows(where: { organization_id: { _eq: `"$($org.id)`" } }) { id name } }"
if (-not $wfData -or $wfData.workflows.Count -eq 0) {
    Write-Error "No workflows found. Please create at least one workflow first via the UI."
    exit 1
}

$workflows = $wfData.workflows
Write-Host "  Found $($workflows.Count) workflow(s)" -ForegroundColor Yellow

# 3. Define demo statuses and run data
$demoRuns = @(
    @{ status = "completed";  triggerType = "manual";    hoursAgo = 1;  durationMin = 2;  error = $null },
    @{ status = "completed";  triggerType = "webhook";   hoursAgo = 3;  durationMin = 1;  error = $null },
    @{ status = "failed";     triggerType = "scheduled"; hoursAgo = 5;  durationMin = 0;  error = "Step 2 failed: HTTP 429 Too Many Requests" },
    @{ status = "completed";  triggerType = "manual";    hoursAgo = 8;  durationMin = 3;  error = $null },
    @{ status = "paused";     triggerType = "webhook";   hoursAgo = 10; durationMin = 0;  error = $null },
    @{ status = "completed";  triggerType = "manual";    hoursAgo = 24; durationMin = 2;  error = $null }
)

$insertRunQuery = "mutation InsertRun(\$workflowId: uuid!, \$status: String!, \$triggerType: String!, \$error: String, \$startedAt: timestamptz!, \$completedAt: timestamptz) { insert_workflow_runs_one(object: { workflow_id: \$workflowId status: \$status trigger_type: \$triggerType error: \$error started_at: \$startedAt completed_at: \$completedAt }) { id status } }"

$insertedCount = 0
foreach ($wf in $workflows) {
    Write-Host "  Seeding runs for: $($wf.name)" -ForegroundColor Gray
    foreach ($run in $demoRuns) {
        $startedAt = (Get-Date).AddHours(-$run.hoursAgo).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $completedAt = if ($run.status -ne "running" -and $run.status -ne "paused") {
            (Get-Date).AddHours(-$run.hoursAgo).AddMinutes($run.durationMin).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        } else {
            $null
        }

        $vars = @{
            workflowId  = $wf.id
            status      = $run.status
            triggerType = $run.triggerType
            error       = $run.error
            startedAt   = $startedAt
            completedAt = $completedAt
        }

        $result = Invoke-Hasura $insertRunQuery $vars
        if ($result -and $result.insert_workflow_runs_one) {
            Write-Host "    + Inserted: $($run.status) ($($run.triggerType))" -ForegroundColor Green
            $insertedCount++
        } else {
            Write-Host "    - Failed to insert: $($run.status)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done! Inserted $insertedCount demo run(s)." -ForegroundColor Green
Write-Host "Visit http://localhost:3000/workflows/runs to see them." -ForegroundColor Cyan
