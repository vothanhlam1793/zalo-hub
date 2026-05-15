Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RunDir = Join-Path $RootDir '.run'

$ChatMetaFile = Join-Path $RunDir 'chat-server.json'
$ZaloMetaFile = Join-Path $RunDir 'zalo-service.json'

function Invoke-Taskkill {
  param([string[]]$Arguments)

  $process = Start-Process -FilePath 'taskkill.exe' -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Output = @()
  }
}

function Stop-ServiceProcess {
  param(
    [string]$Name,
    [string]$MetaFile
  )

  if (-not (Test-Path -LiteralPath $MetaFile)) {
    "{0} khong co metadata file" -f $Name
    return
  }

  try {
    $meta = Get-Content -LiteralPath $MetaFile -Raw | ConvertFrom-Json
  } catch {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    "{0} metadata khong hop le, da xoa" -f $Name
    return
  }

  if (-not $meta.Pid) {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    "{0} metadata khong co PID, da xoa" -f $Name
    return
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($meta.Pid)" -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    "{0} PID {1} khong con chay" -f $Name, $meta.Pid
    return
  }

  $expectedCommandLine = [string]$meta.CommandLine
  if ($expectedCommandLine -and $process.CommandLine -ne $expectedCommandLine) {
    Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
    "{0} PID {1} da bi tai su dung boi process khac, chi xoa metadata" -f $Name, $meta.Pid
    return
  }

  "Dang stop {0} (PID {1})" -f $Name, $meta.Pid

  $taskkillResult = Invoke-Taskkill -Arguments @('/PID', [string]$meta.Pid, '/T')
  $taskkillExitCode = $taskkillResult.ExitCode
  if ($taskkillExitCode -ne 0) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($meta.Pid)" -ErrorAction SilentlyContinue
    if ($null -eq $current) {
      $stopped = $true
    }
  }

  $stopped = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($meta.Pid)" -ErrorAction SilentlyContinue
    if ($null -eq $current) {
      $stopped = $true
      break
    }
  }

  if (-not $stopped) {
    Invoke-Taskkill -Arguments @('/PID', [string]$meta.Pid, '/T', '/F') | Out-Null
    "{0} khong tu thoat, da force kill" -f $Name
  }

  Remove-Item -LiteralPath $MetaFile -Force -ErrorAction SilentlyContinue
}

Stop-ServiceProcess -Name 'chat-server' -MetaFile $ChatMetaFile
Stop-ServiceProcess -Name 'zalo-service' -MetaFile $ZaloMetaFile
