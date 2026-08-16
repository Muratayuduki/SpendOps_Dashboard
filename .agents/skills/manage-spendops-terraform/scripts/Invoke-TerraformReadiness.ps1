param(
    [switch]$Init,
    [switch]$BuildLambda,
    [ValidateSet("None", "Apply", "Destroy")]
    [string]$Plan = "None",
    [string]$PlanPath,
    [string[]]$Variable = @(),
    [switch]$SkipState
)

$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$terraformDir = Join-Path $repoRoot "implementation\terraform"

if (-not (Test-Path -LiteralPath $terraformDir -PathType Container)) {
    throw "Terraform directory was not found: $terraformDir"
}

if ($Plan -ne "None") {
    if ([string]::IsNullOrWhiteSpace($PlanPath)) {
        throw "-PlanPath is required when -Plan is Apply or Destroy."
    }
    if ([IO.Path]::IsPathRooted($PlanPath)) {
        throw "Use a new relative Plan path inside the terraform directory."
    }
    if ((Split-Path -Leaf $PlanPath) -notmatch '\.tfplan$') {
        throw "PlanPath must end with .tfplan."
    }
}

Push-Location $terraformDir
try {
    Invoke-NativeCommand terraform version

    if ($Init) {
        Invoke-NativeCommand terraform init -input=false
    }

    if ($BuildLambda) {
        $buildScript = Join-Path $repoRoot "implementation\lambda\build.ps1"
        if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
            throw "Lambda build script was not found: $buildScript"
        }
        & $buildScript
        if ($LASTEXITCODE -ne 0) {
            throw "Lambda build failed with exit code $LASTEXITCODE"
        }
    }

    Invoke-NativeCommand terraform fmt -check -recursive
    Invoke-NativeCommand terraform validate
    Invoke-NativeCommand terraform workspace show

    if (-not $SkipState) {
        Invoke-NativeCommand terraform state list
    }

    if ($Plan -ne "None") {
        if (Test-Path -LiteralPath $PlanPath) {
            throw "Refusing to overwrite or reuse an existing Plan: $PlanPath"
        }

        $planArguments = @("plan", "-input=false", "-out=$PlanPath")
        if ($Plan -eq "Destroy") {
            $planArguments += "-destroy"
        }
        foreach ($item in $Variable) {
            if ([string]::IsNullOrWhiteSpace($item) -or $item -notmatch "^[A-Za-z_][A-Za-z0-9_]*=.+$") {
                throw "Each -Variable value must use name=value syntax."
            }
            $planArguments += "-var=$item"
        }

        Invoke-NativeCommand terraform @planArguments

        Invoke-NativeCommand terraform show -no-color $PlanPath
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $PlanPath).Hash
        Write-Output "Plan SHA256: $hash"
    }
}
finally {
    Pop-Location
}
