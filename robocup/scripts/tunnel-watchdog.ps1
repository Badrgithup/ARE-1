# Cloudflare Tunnel Watchdog for Windows (RoboCup Arena)
# Continuously monitors cloudflared process and auto-recovers on crash/exit

param(
    [int]$CheckIntervalSeconds = 5,
    [string]$TunnelLogFile = "logs/tunnel/tunnel-watchdog.log"
)

$ErrorActionPreference = "Continue"

# Resolve script directory and root project directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir

# Ensure log directory exists
$LogDir = Join-Path $ProjectDir "logs/tunnel"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$LogPath = Join-Path $ProjectDir $TunnelLogFile

function Log-Message {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogPath -Value $logMessage -ErrorAction SilentlyContinue
}

Log-Message "============================================================"
Log-Message "🚀 RoboCup Arena Cloudflare Tunnel Watchdog Started"
Log-Message "Checking process every $CheckIntervalSeconds seconds"
Log-Message "============================================================"

$script:running = $true

# Register Ctrl+C handler
[Console]::TreatControlCAsInput = $false

while ($script:running) {
    try {
        $processes = Get-Process cloudflared -ErrorAction SilentlyContinue

        if ($null -eq $processes -or $processes.Count -eq 0) {
            Log-Message "⚠️ [WATCHDOG] cloudflared process not found!"
            Log-Message "🔄 [WATCHDOG] Initiating tunnel supervisor restart..."

            try {
                # Start tunnel supervisor via npm script or node
                Start-Process -FilePath "node" -ArgumentList "scripts/tunnel-supervisor.mjs" -WorkingDirectory $ProjectDir -WindowStyle Hidden
                Log-Message "✓ [WATCHDOG] Tunnel supervisor launch triggered"
            } catch {
                Log-Message "❌ [WATCHDOG] Failed to trigger restart: $_"
            }

            Start-Sleep -Seconds 3
        } else {
            $pids = ($processes | ForEach-Object { $_.Id }) -join ", "
            Log-Message "✓ [WATCHDOG] cloudflared active (PID: $pids)"
        }
    } catch {
        Log-Message "❌ [WATCHDOG] Exception during health check: $_"
    }

    Start-Sleep -Seconds $CheckIntervalSeconds
}
