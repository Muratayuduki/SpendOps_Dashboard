param(
    [switch]$SkipFrontend,
    [switch]$SkipLambda,
    [switch]$SkipTerraform
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    Write-Output "[RUN] $Command $($Arguments -join ' ')"
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Push-Location $repoRoot
try {
    if (-not $SkipFrontend) {
        Invoke-Checked node implementation/app-site/tests/analysis.test.js
        Invoke-Checked node implementation/app-site/tests/auth.test.js
        Invoke-Checked node implementation/app-site/tests/generated-comparison.test.js
        Invoke-Checked node --check implementation/app-site/script.js
    }

    if (-not $SkipLambda) {
        Invoke-Checked python -B -m unittest discover -s implementation/lambda/tests -p test_*.py
    }

    if (-not $SkipTerraform) {
        Push-Location (Join-Path $repoRoot "implementation\terraform")
        try {
            Invoke-Checked terraform fmt -check -recursive
            Invoke-Checked terraform validate
            Invoke-Checked terraform state list
        }
        finally {
            Pop-Location
        }
    }
}
finally {
    Pop-Location
}
