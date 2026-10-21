$ErrorActionPreference = 'Stop'

# backend\plugin.cjs is a build artifact and is not tracked in git,
# so building is part of packaging.
& (Join-Path $PSScriptRoot 'build-backend.ps1')

$dist = Join-Path $PSScriptRoot 'dist'
if (-not (Test-Path $dist)) {
    New-Item -ItemType Directory -Path $dist | Out-Null
}
$source = Join-Path $PSScriptRoot 'com.nanqing.apiusage.plugin'
$tempZip = Join-Path $dist 'api-usage-monitor-temp.zip'
$final = Join-Path $dist 'api-usage-monitor.flexplugin'
if (Test-Path $tempZip) { Remove-Item -Force $tempZip }
if (Test-Path $final) { Remove-Item -Force $final }

# Only ship the plugin's real files. Anything else that accumulates in the
# plugin directory (logs\, editor temp files) must not end up in the archive.
$payload = @(
    (Join-Path $source 'manifest.json'),
    (Join-Path $source 'config.json'),
    (Join-Path $source 'backend'),
    (Join-Path $source 'ui')
)
foreach ($item in $payload) {
    if (-not (Test-Path $item)) { throw "missing plugin file: $item" }
}

# Files land at the archive root (no wrapper folder).
Compress-Archive -Path $payload -DestinationPath $tempZip -Force
Rename-Item -Path $tempZip -NewName $final
Write-Host "Created: $final"
