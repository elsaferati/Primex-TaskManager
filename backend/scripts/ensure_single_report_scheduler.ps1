param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Stop", "Verify")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-OneHReportSchedulerProcess {
    @(
        Get-CimInstance Win32_Process |
            Where-Object {
                $_.Name -match '^python(?:\d+(?:\.\d+)*)?\.exe$' -and
                $_.CommandLine -and
                $_.CommandLine -match '(?i)(?:^|[\\/\s"])report_scheduler\.py(?:["\s]|$)'
            }
    )
}

if ($Mode -eq "Stop") {
    $schedulerProcesses = @(Get-OneHReportSchedulerProcess)
    foreach ($schedulerProcess in $schedulerProcesses) {
        Write-Host "Stopping stale 1H report scheduler PID $($schedulerProcess.ProcessId): $($schedulerProcess.CommandLine)"
        Stop-Process -Id $schedulerProcess.ProcessId -Force -ErrorAction Stop
    }

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $remaining = @(Get-OneHReportSchedulerProcess)
        if ($remaining.Count -eq 0) {
            Write-Host "All legacy 1H report scheduler processes are stopped."
            exit 0
        }
        Start-Sleep -Milliseconds 250
    }

    $remainingIds = (@(Get-OneHReportSchedulerProcess) | ForEach-Object { $_.ProcessId }) -join ", "
    throw "Unable to stop legacy 1H report scheduler process(es): $remainingIds"
}

$running = @(Get-OneHReportSchedulerProcess)
if ($running.Count -ne 1) {
    $details = ($running | ForEach-Object { "PID=$($_.ProcessId) CMD=$($_.CommandLine)" }) -join "`n"
    throw "Expected exactly one 1H report scheduler process; found $($running.Count).`n$details"
}

Write-Host "Exactly one 1H report scheduler is running: PID $($running[0].ProcessId)."
