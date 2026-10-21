# Builds backend\plugin.cjs from src\plugin.js.
# backend\plugin.cjs is a build artifact and is NOT tracked in git, so every
# packaging/install script must run this first.
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$src = Join-Path $root 'src\plugin.js'
$out = Join-Path $root 'com.nanqing.apiusage.plugin\backend\plugin.cjs'

if (-not (Test-Path $src)) { throw "missing source: $src" }

$needsBuild = $Force.IsPresent -or (-not (Test-Path $out))
if (-not $needsBuild) {
    $needsBuild = (Get-Item $src).LastWriteTimeUtc -gt (Get-Item $out).LastWriteTimeUtc
}

if ($needsBuild) {
    # Call rollup's own bin through node: npx inside this harness can fail with
    # a PowerShell NativeCommandError and a bogus exit code.
    $rollupBin = Join-Path $root 'node_modules\rollup\dist\bin\rollup'
    if (-not (Test-Path $rollupBin)) {
        throw 'rollup is not installed; run: npm install'
    }
    $outDir = Split-Path $out -Parent
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

    Push-Location $root
    $prevPref = $ErrorActionPreference
    # rollup writes its warnings to stderr; with $ErrorActionPreference='Stop'
    # PowerShell would turn the first warning into a terminating error.
    $ErrorActionPreference = 'Continue'
    try {
        $log = @(& node $rollupBin -c 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevPref
        Pop-Location
    }
    $log | ForEach-Object { Write-Host $_ }
    if ($code -ne 0) { throw "rollup failed with exit code $code" }
    if (-not (Test-Path $out)) { throw "build produced no output: $out" }
    Write-Host ("BUILD_OK=" + (Get-Item $out).Length + " bytes from src\plugin.js")
} else {
    Write-Host ("BUILD_SKIPPED=up to date, " + (Get-Item $out).Length + " bytes")
}
