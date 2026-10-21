$ErrorActionPreference = 'Stop'

$installed = Join-Path $env:APPDATA 'FlexDesigner\data\plugins\com.nanqing.apiusage'
$src = Join-Path $PSScriptRoot 'com.nanqing.apiusage.plugin'

# backend\plugin.cjs is a build artifact (not tracked in git): build it if
# missing or older than src\plugin.js.
& (Join-Path $PSScriptRoot 'build-backend.ps1')

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
# Backups must live OUTSIDE data\plugins: FlexDesigner treats every directory in
# there as a plugin, logs "Plugin already loaded", and then deletes the duplicate.
$backupRoot = Join-Path $env:APPDATA 'FlexDesigner\data\plugin-backups'
$backup = Join-Path $backupRoot ('com.nanqing.apiusage-' + $stamp)

if (Test-Path $installed) {
    if (-not (Test-Path $backupRoot)) { New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null }
    Copy-Item $installed $backup -Recurse -Force
    Write-Host ("BACKUP=" + $backup)
}

foreach ($sub in @('backend', 'ui')) {
    $p = Join-Path $installed $sub
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

Copy-Item (Join-Path $src 'manifest.json') (Join-Path $installed 'manifest.json') -Force
Copy-Item (Join-Path $src 'backend\plugin.cjs') (Join-Path $installed 'backend\plugin.cjs') -Force
Copy-Item (Join-Path $src 'ui\*') (Join-Path $installed 'ui') -Recurse -Force

# Never overwrite a live config: it holds the user's API keys.
$installedConfig = Join-Path $installed 'config.json'
if (-not (Test-Path $installedConfig)) {
    Copy-Item (Join-Path $src 'config.json') $installedConfig -Force
    Write-Host 'CONFIG_SEEDED=fresh template'
} else {
    Write-Host 'CONFIG_PRESERVED=existing user config kept'
}

Write-Host 'INSTALLED_OK'
Write-Host ("VERSION_LINE=" + ((Get-Content (Join-Path $installed 'manifest.json') -Encoding UTF8 | Select-String '"version"').Line.Trim()))
