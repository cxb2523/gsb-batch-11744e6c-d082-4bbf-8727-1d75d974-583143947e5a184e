<#
.SYNOPSIS
  First-run setup: create the database indexes, master data and global admin.

.DESCRIPTION
  A thin wrapper around backend/scripts/init_db.py. It finds (or creates) the
  backend virtualenv, installs dependencies, collects the admin credentials and
  hands them to init_db through environment variables so they never appear in
  the process list or your shell history.

  This is the path for a MongoDB you are running yourself. If you want Docker to
  run MongoDB too, use the one-shot init service instead - it needs no venv:

    docker compose run --rm init --email you@example.com --password '...'

  Safe to run more than once: init_db is idempotent.

.PARAMETER Email
  Admin email. Prompted for if omitted.

.PARAMETER Password
  Admin password. Prompted for (hidden, twice) if omitted. Supply it only for
  unattended runs: a command line is visible to other users and lands in your
  PowerShell history.

.PARAMETER Name
  Admin display name. Defaults to "Administrator".

.PARAMETER ResetPassword
  Overwrite the password if the account already exists.

.PARAMETER SkipAdmin
  Only create indexes and master data.

.PARAMETER Uri
  MongoDB URI, in place of the one in backend/.env.

.PARAMETER Database
  Database name, in place of the one in backend/.env.

.EXAMPLE
  .\scripts\setup.ps1

.EXAMPLE
  .\scripts\setup.ps1 -Email you@example.com -Name "Ada Lovelace"

.EXAMPLE
  .\scripts\setup.ps1 -Email you@example.com -Password 'choose-a-real-one'
#>
[CmdletBinding()]
param(
  [string]$Email,
  [string]$Password,
  [string]$Name,
  [switch]$ResetPassword,
  [switch]$SkipAdmin,
  [string]$Uri,
  [string]$Database
)

$ErrorActionPreference = 'Stop'

# Friendly guard. This is the PowerShell script, so its flags are -Email /
# -Password (a single dash), not the --email / --password that setup.sh and the
# Docker init take. When someone copies the bash invocation, PowerShell does not
# recognise --email as a parameter; it binds the literal "--email" as a
# positional value, which then fails deep inside init_db with a baffling
# "does not look like an email address". Catch it here and say what to type.
foreach ($Arg in @($Email, $Password, $Name)) {
  if ($Arg -like '--*') {
    Write-Host ''
    Write-Host 'That looks like bash-style flags (--email). This is the PowerShell script;' -ForegroundColor Red
    Write-Host 'use single-dash parameters instead:' -ForegroundColor Red
    Write-Host ''
    Write-Host "  .\scripts\setup.ps1 -Email you@example.com -Password 'choose-a-real-one'"
    Write-Host ''
    exit 2
  }
}

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$VenvPython = Join-Path $Backend '.venv\Scripts\python.exe'

if (-not (Test-Path $Backend)) {
  throw "No backend directory at $Backend. Run this from a checkout of the repository."
}

# backend/.env holds the Mongo URI init_db connects with. Without it the
# defaults (localhost:27017) apply, which is usually right for a local install
# but never right for Docker, so say so rather than failing cryptically later.
$EnvFile = Join-Path $Backend '.env'
if (-not (Test-Path $EnvFile)) {
  $Example = Join-Path $Backend '.env.example'
  if (Test-Path $Example) {
    Write-Host "No backend\.env yet - copying .env.example." -ForegroundColor Yellow
    Copy-Item $Example $EnvFile
    Write-Host "Edit backend\.env before going to production (APP_SECRET_KEY especially)." -ForegroundColor Yellow
  } else {
    Write-Host "No backend\.env found; using built-in defaults (mongodb://localhost:27017)." -ForegroundColor Yellow
  }
}

# The URI init_db will use, for the pre-flight check and the closing message.
$MongoUri = 'mongodb://localhost:27017'
if ($Uri) {
  $MongoUri = $Uri
} elseif (Test-Path $EnvFile) {
  $Line = Select-String -Path $EnvFile -Pattern '^\s*APP_MONGODB_URI=' | Select-Object -Last 1
  if ($Line) {
    $Value = ($Line.Line -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($Value) { $MongoUri = $Value }
  }
}

# Fail early and usefully when MongoDB is not up. init_db would report it too,
# but only after building the venv, and without naming the Docker alternative.
# Only the plain mongodb://host:port form is checked; anything fancier (SRV,
# credentials, a replica set) is left to init_db's own connection attempt.
if ($MongoUri -match '^mongodb://([A-Za-z0-9._-]+)(:([0-9]+))?/?$') {
  $MongoHost = $Matches[1]
  if ($Matches[3]) { $MongoPort = [int]$Matches[3] } else { $MongoPort = 27017 }
  $Client = New-Object System.Net.Sockets.TcpClient
  try {
    $Reachable = $Client.ConnectAsync($MongoHost, $MongoPort).Wait(2000)
  } catch {
    $Reachable = $false
  } finally {
    $Client.Dispose()
  }
  if (-not $Reachable) {
    Write-Host ''
    Write-Host "Nothing is listening at ${MongoHost}:${MongoPort}, so there is no database to set up." -ForegroundColor Red
    Write-Host ''
    Write-Host 'Either start MongoDB yourself and re-run this, or let Docker run the whole'
    Write-Host 'thing - mongo included - with the one-shot init service:'
    Write-Host ''
    Write-Host "  docker compose run --rm init --email you@example.com --password '...'"
    Write-Host ''
    Write-Host '(APP_MONGODB_URI in backend\.env is what this script connects to.)'
    exit 1
  }
}

if (-not (Test-Path $VenvPython)) {
  Write-Host 'Creating virtualenv in backend\.venv ...'
  $SystemPython = (Get-Command python -ErrorAction SilentlyContinue).Source
  if (-not $SystemPython) {
    throw 'python not found on PATH. Install Python 3.11+ and try again.'
  }
  & $SystemPython -m venv (Join-Path $Backend '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the virtualenv.' }

  Write-Host 'Installing dependencies ...'
  & $VenvPython -m pip install --upgrade pip --quiet
  & $VenvPython -m pip install -r (Join-Path $Backend 'requirements.txt') --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed.' }
}

$ScriptArgs = @('-m', 'scripts.init_db')
if ($Uri) { $ScriptArgs += @('--uri', $Uri) }
if ($Database) { $ScriptArgs += @('--db', $Database) }

if ($SkipAdmin) {
  $ScriptArgs += '--skip-admin'
} else {
  if (-not $Email) { $Email = Read-Host 'Admin email' }
  if (-not $Name)  { $Name = 'Administrator' }

  if ($Password) {
    # Supplied on the command line for an unattended run; no prompt, no confirm.
    $Plain = $Password
  } else {
    $Secure = Read-Host 'Admin password' -AsSecureString
    $Confirm = Read-Host 'Confirm password' -AsSecureString

    # SecureString -> plaintext only here, at the last moment, so it can be handed
    # to the child process. Both buffers are freed in the finally below.
    $PtrA = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    $PtrB = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Confirm)
    try {
      $Plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PtrA)
      $PlainConfirm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PtrB)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PtrA)
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PtrB)
    }

    if ($Plain -ne $PlainConfirm) { throw 'Passwords did not match.' }
  }

  if ($Plain.Length -lt 8) { throw 'Password must be at least 8 characters.' }

  $env:APP_INIT_ADMIN_EMAIL = $Email
  $env:APP_INIT_ADMIN_PASSWORD = $Plain
  $env:APP_INIT_ADMIN_NAME = $Name

  if ($ResetPassword) { $ScriptArgs += '--reset-password' }
}

try {
  Push-Location $Backend
  & $VenvPython @ScriptArgs
  $Code = $LASTEXITCODE
} finally {
  Pop-Location
  # Never leave the password in the session's environment.
  Remove-Item Env:\APP_INIT_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\APP_INIT_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:\APP_INIT_ADMIN_NAME -ErrorAction SilentlyContinue
}

if ($Code -ne 0) { exit $Code }

Write-Host ''
Write-Host 'Setup complete. Start the app:' -ForegroundColor Green
Write-Host ''
Write-Host '  cd backend ; .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload'
Write-Host '  cd frontend ; npm ci ; npm run dev'
Write-Host ''
Write-Host "This set up the database at $MongoUri. Note that 'docker compose up' runs its"
Write-Host 'own MongoDB inside the Compose network, which is NOT the one above and has not'
Write-Host 'been touched - to set that one up instead:'
Write-Host ''
Write-Host "  docker compose run --rm init --email you@example.com --password '...'"
