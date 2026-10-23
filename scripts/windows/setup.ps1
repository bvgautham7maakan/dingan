# KEM Site – first-time setup / update on the ZBook (run in PowerShell from the app folder):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
# Safe to run again after "git pull": installs packages, applies new migrations, rebuilds.
$ErrorActionPreference = "Stop"
$App = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $App

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed. Install Node.js 22 LTS from nodejs.org first." }
$major = [int]((node -v).TrimStart("v").Split(".")[0])
if ($major -lt 20) { throw "Node.js 20 or newer is needed (found $(node -v))." }

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env – edit SEED_TEMP_PASSWORD, BACKUP_DIR and COOKIE_SECURE, then run this script again." -ForegroundColor Yellow
  notepad ".env"
  exit 0
}
New-Item -ItemType Directory -Force -Path "data", "data\logs" | Out-Null

Write-Host "Installing packages..." -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

Write-Host "Applying database migrations..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "migrate deploy failed" }

if (-not (Test-Path "data\.seeded")) {
  Write-Host "First run: adding users, sites, projects and demo data..." -ForegroundColor Cyan
  npm run seed
  if ($LASTEXITCODE -ne 0) { throw "seed failed" }
  New-Item -ItemType File -Path "data\.seeded" | Out-Null
}

Write-Host "Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }
Write-Host "Done. Start with scripts\windows\start-kem.cmd or install the service (install-service.ps1)." -ForegroundColor Green
