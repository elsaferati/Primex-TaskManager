# Run on the report server. Reads the existing backend .env; no secrets in this script.
$ErrorActionPreference = 'Stop'
$backendDirectory = Split-Path -Parent $PSScriptRoot
$pythonPath = 'C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe'
$pm2Path = 'C:\npm-global\pm2.cmd'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Server Python executable not found.' }
if (-not (Test-Path -LiteralPath $pm2Path)) { throw 'Server PM2 executable not found.' }

Push-Location $backendDirectory
try {
    $emailConfig = & $pythonPath -c "import json; from dotenv import dotenv_values; c=dotenv_values('.env'); print(json.dumps({k:c.get(k) for k in ('EMAIL_USER','EMAIL_PASSWORD','EMAIL_HOST','EMAIL_PORT')}))"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to load server email configuration.' }
    $emailConfig = $emailConfig | ConvertFrom-Json
    if ($emailConfig.EMAIL_USER -ne '130primex.eu@gmail.com' -or [string]::IsNullOrWhiteSpace($emailConfig.EMAIL_PASSWORD)) {
        throw 'Expected report sender or App Password is missing.'
    }
    $env:EMAIL_USER = $emailConfig.EMAIL_USER
    $env:EMAIL_PASSWORD = $emailConfig.EMAIL_PASSWORD
    $env:EMAIL_HOST = $emailConfig.EMAIL_HOST
    $env:EMAIL_PORT = $emailConfig.EMAIL_PORT
    $env:PM2_HOME = 'C:\pm2-system'

    & $pythonPath -m scripts.check_report_email
    if ($LASTEXITCODE -ne 0) { throw 'SMTP authentication failed. Processes were not restarted.' }

    # jlist contains secrets. Keep its JSON in memory and emit only names.
    $processJson = & $pm2Path jlist
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read PM2 processes.' }
    $processNames = ($processJson -join "`n") | & $pythonPath -c "import json,sys; print('\n'.join(a['name'] for a in json.load(sys.stdin)))"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to parse PM2 process names.' }
    $targets = @(
        'primex-backend', 'backend-api-flow', 'primex-public-api',
        'primeflow-report-scheduler', 'primex-tomorrow-shtypi-scheduler',
        'celery_worker', 'celery_beat'
    ) | Where-Object { $processNames -contains $_ }
    if ($targets.Count -eq 0) { throw 'No known report delivery processes were found.' }
    foreach ($target in $targets) {
        & $pm2Path restart $target --update-env
        if ($LASTEXITCODE -ne 0) { throw "PM2 restart failed for $target." }
    }
    & $pm2Path save
    if ($LASTEXITCODE -ne 0) { throw 'Unable to persist the updated PM2 process configuration.' }
    & $pm2Path status
    Write-Host 'Report email credentials applied. Verify delivery history and recipient inboxes.'
} finally {
    Remove-Item Env:EMAIL_PASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
