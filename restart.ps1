Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

& (Join-Path $RootDir 'stop.ps1')
& (Join-Path $RootDir 'start.ps1')
