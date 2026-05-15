Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunDir = Join-Path $RootDir '.run'
$LogDir = Join-Path $RunDir 'logs'

$ChatMetaFile = Join-Path $RunDir 'chat-server.json'
$ZaloMetaFile = Join-Path $RunDir 'zalo-service.json'

$DistDir = Join-Path $RootDir 'dist'
$DistChatClientDir = Join-Path $DistDir 'chat-server\client'
$SrcChatClientDir = Join-Path $RootDir 'src\chat-server\client'

function Ensure-Dir {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Get-TrackedProcess {
  param([string]$MetaFile)

  if (-not (Test-Path -LiteralPath $MetaFile)) {
    return $null
  }

  try {
    $meta = Get-Content -LiteralPath $MetaFile -Raw | ConvertFrom-Json
  } catch {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  if (-not $meta.Pid) {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($meta.Pid)" -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  $expectedCommandLine = [string]$meta.CommandLine
  if ($expectedCommandLine -and $process.CommandLine -ne $expectedCommandLine) {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    return $null
  }

  return [pscustomobject]@{
    Meta = $meta
    Process = $process
  }
}

function Start-ServiceProcess {
  param(
    [string]$Name,
    [string]$ArgumentList,
    [string]$MetaFile,
    [string]$LogFile
  )

  $tracked = Get-TrackedProcess -MetaFile $MetaFile
  if ($null -ne $tracked) {
    "{0} da dang chay voi PID {1}" -f $Name, $tracked.Process.ProcessId
    return
  }

  Ensure-Dir -Path (Split-Path -Parent $LogFile)
  if (-not (Test-Path -LiteralPath $LogFile)) {
    New-Item -ItemType File -Path $LogFile | Out-Null
  }

  $escapedLogFile = $LogFile.Replace('"', '""')
  $command = "node $ArgumentList >> `"$escapedLogFile`" 2>&1"
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/s', '/c', $command -WorkingDirectory $RootDir -WindowStyle Hidden -PassThru

  Start-Sleep -Milliseconds 300

  $trackedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction SilentlyContinue
  $trackedCommandLine = ''
  if ($null -ne $trackedProcess) {
    $trackedCommandLine = [string]($trackedProcess | Select-Object -ExpandProperty CommandLine -ErrorAction SilentlyContinue)
  }

  $meta = [pscustomobject]@{
    pid = $process.Id
    commandLine = $trackedCommandLine
    startedAt = (Get-Date).ToString('o')
    name = $Name
  }
  $meta | ConvertTo-Json | Set-Content -LiteralPath $MetaFile -Encoding UTF8

  "Da start {0} voi PID {1}" -f $Name, $process.Id
}

Ensure-Dir -Path $RunDir
Ensure-Dir -Path $LogDir

'Building project...'
npm run build
if (-not $?) {
  exit 1
}

Ensure-Dir -Path $DistChatClientDir
Copy-Item -LiteralPath (Join-Path $SrcChatClientDir 'index.html') -Destination (Join-Path $DistChatClientDir 'index.html') -Force
Copy-Item -LiteralPath (Join-Path $SrcChatClientDir 'styles.css') -Destination (Join-Path $DistChatClientDir 'styles.css') -Force
Copy-Item -LiteralPath (Join-Path $SrcChatClientDir 'app.js') -Destination (Join-Path $DistChatClientDir 'app.js') -Force

Start-ServiceProcess -Name 'zalo-service' -ArgumentList 'dist/zalo-service/index.js' -MetaFile $ZaloMetaFile -LogFile (Join-Path $LogDir 'zalo-service.log')
Start-ServiceProcess -Name 'chat-server' -ArgumentList 'dist/chat-server/index.js' -MetaFile $ChatMetaFile -LogFile (Join-Path $LogDir 'chat-server.log')

''
'chat-server: http://localhost:3199'
'zalo-service: http://localhost:3299'
"Logs: $LogDir"
