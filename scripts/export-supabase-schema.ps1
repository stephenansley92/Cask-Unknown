param(
  [string]$DbUrl = $env:SUPABASE_DB_URL,
  [string]$OutputDirectory = "artifacts/supabase-preflight"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  throw "Set SUPABASE_DB_URL to a percent-encoded Postgres connection string before running this script."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $projectRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$schemaPath = Join-Path $outputPath "production-schema.sql"
$rolesPath = Join-Path $outputPath "production-roles.sql"
$preflightPath = Join-Path $projectRoot "supabase/preflight.sql"
$reportPath = Join-Path $outputPath "preflight-report.txt"
$catalogScript = Join-Path $projectRoot "scripts/export-postgres-catalog.mjs"

Push-Location $projectRoot
try {
  & node $catalogScript $OutputDirectory

  if ($LASTEXITCODE -ne 0) {
    throw "Direct PostgreSQL catalog export failed."
  }

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Add-Content -LiteralPath $reportPath -Value (
      "Supabase CLI schema export was skipped because Docker is unavailable. " +
      "The direct catalog and aggregate preflight exports completed successfully."
    )
    Write-Warning "Docker is unavailable; continuing with the direct catalog export."
    Write-Output "Catalog export: $(Join-Path $outputPath 'production-catalog.json')"
    Write-Output "Preflight data: $(Join-Path $outputPath 'preflight-results.json')"
    return
  }

  & npx.cmd --yes supabase@2.109.1 db dump `
    --db-url $DbUrl `
    --schema "public,extensions" `
    --keep-comments `
    --file $schemaPath

  if ($LASTEXITCODE -ne 0) {
    Add-Content -LiteralPath $reportPath -Value (
      "Supabase CLI schema export was skipped because its Docker dependency was unavailable. " +
      "The direct catalog and aggregate preflight exports completed successfully."
    )
    Write-Warning "Supabase CLI schema export requires Docker; continuing with the direct catalog export."
    Write-Output "Catalog export: $(Join-Path $outputPath 'production-catalog.json')"
    Write-Output "Preflight data: $(Join-Path $outputPath 'preflight-results.json')"
    return
  }

  & npx.cmd --yes supabase@2.109.1 db dump `
    --db-url $DbUrl `
    --role-only `
    --file $rolesPath

  if ($LASTEXITCODE -ne 0) {
    throw "Supabase role export failed."
  }

  & npx.cmd --yes supabase@2.109.1 db lint `
    --db-url $DbUrl `
    --schema "public" `
    --level warning 2>&1 | Tee-Object -FilePath $reportPath

  if ($LASTEXITCODE -ne 0) {
    throw "Supabase database lint failed. See $reportPath."
  }

  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if ($psql) {
    & $psql.Source $DbUrl -X --set ON_ERROR_STOP=1 --file $preflightPath 2>&1 |
      Tee-Object -FilePath $reportPath -Append

    if ($LASTEXITCODE -ne 0) {
      throw "Database preflight queries failed. See $reportPath."
    }
  } else {
    Add-Content -LiteralPath $reportPath -Value (
      "`npsql was not found. Run supabase/preflight.sql in the Supabase SQL Editor " +
      "and append the results to this report before applying security migrations."
    )
  }
} finally {
  Pop-Location
}

Write-Output "Schema export: $schemaPath"
Write-Output "Role export:   $rolesPath"
Write-Output "Audit report:  $reportPath"
