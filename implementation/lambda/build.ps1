$ErrorActionPreference = "Stop"

$lambdaRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $lambdaRoot "src\handler.py"
$distDirectory = Join-Path $lambdaRoot "dist"
$zipPath = Join-Path $distDirectory "spendops_api.zip"

if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Lambda source was not found: $sourcePath"
}

New-Item -ItemType Directory -Path $distDirectory -Force | Out-Null
Compress-Archive -LiteralPath $sourcePath -DestinationPath $zipPath -Force

Write-Output "Lambda package created: $zipPath"
