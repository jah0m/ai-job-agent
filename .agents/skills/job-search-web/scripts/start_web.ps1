$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..\..\..')
)
$privateRoot = Join-Path $repositoryRoot '.job-search'
$frontendIndex = Join-Path $repositoryRoot 'src\ai_job_search\frontend_dist\index.html'
$healthUrl = 'http://127.0.0.1:8765/health'
$dashboardUrl = 'http://127.0.0.1:8765'
$stdoutLog = Join-Path $privateRoot 'dashboard-web.out.log'
$stderrLog = Join-Path $privateRoot 'dashboard-web.err.log'
$pidPath = Join-Path $privateRoot 'dashboard-web.pid'

function Test-JobAtlasHealth {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
        return $health.ok -eq $true
    }
    catch {
        return $false
    }
}

if (Test-JobAtlasHealth) {
    [pscustomobject]@{
        Status = 'AlreadyRunning'
        Url = $dashboardUrl
        Mode = 'Production'
    }
    exit 0
}

$pythonCommand = Get-Command python -ErrorAction Stop
$pythonExecutable = $pythonCommand.Source

& $pythonExecutable -c 'import fastapi, uvicorn' 2>$null
if ($LASTEXITCODE -ne 0) {
    throw 'Web dependencies are missing. Run: python -m pip install -e ".[web]"'
}

if (-not (Test-Path -LiteralPath $frontendIndex -PathType Leaf)) {
    throw 'The production frontend is missing. Run npm ci and npm run build:frontend from the repository root.'
}

if (-not (Test-Path -LiteralPath $privateRoot -PathType Container)) {
    $initScript = Join-Path $repositoryRoot 'scripts\job_search.py'
    & $pythonExecutable $initScript init
    if ($LASTEXITCODE -ne 0) {
        throw "Workspace initialization failed with exit code $LASTEXITCODE."
    }
}

$launchArguments = @(
    '-m'
    'uvicorn'
    'ai_job_search.web:create_app'
    '--factory'
    '--app-dir'
    'src'
    '--host'
    '127.0.0.1'
    '--port'
    '8765'
)

$startParameters = @{
    FilePath = $pythonExecutable
    ArgumentList = $launchArguments
    WorkingDirectory = $repositoryRoot
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $stdoutLog
    RedirectStandardError = $stderrLog
    PassThru = $true
}
$process = Start-Process @startParameters

Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii

foreach ($attempt in 1..40) {
    if (Test-JobAtlasHealth) {
        [pscustomobject]@{
            Status = 'Started'
            Url = $dashboardUrl
            Mode = 'Production'
            ProcessId = $process.Id
            StandardOutput = $stdoutLog
            StandardError = $stderrLog
        }
        exit 0
    }

    $process.Refresh()
    if ($process.HasExited) {
        $errorTail = if (Test-Path -LiteralPath $stderrLog) {
            Get-Content -LiteralPath $stderrLog -Tail 20 | Out-String
        }
        else {
            'No error log was created.'
        }
        throw "AI Job Agent exited before becoming healthy.`n$errorTail"
    }

    Start-Sleep -Milliseconds 250
}

throw "AI Job Agent did not become healthy within 10 seconds. Process ID: $($process.Id). Error log: $stderrLog"
