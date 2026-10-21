# Builds a source-only package for uploading to the repository.
# Docs that do not change with this release (README, HANDOFF, CHANGELOG,
# DEV_REQUESTS) are intentionally left out, and so is the build artifact
# com.nanqing.apiusage.plugin/backend/plugin.cjs — it is produced by
# `npm run build` (or build-backend.ps1) and must never be committed.
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$stageRoot = Join-Path $root 'dist\_repo_stage'
$stage = Join-Path $stageRoot 'api-usage-monitor'
$pluginSrc = Join-Path $root 'com.nanqing.apiusage.plugin'
$outZip = Join-Path $root 'dist\api-usage-monitor-repo.zip'

Remove-Item $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $stage 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'test') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'com.nanqing.apiusage.plugin\backend') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'com.nanqing.apiusage.plugin\ui') -Force | Out-Null

foreach ($file in @('package.json', 'package-lock.json', 'rollup.config.mjs', '.gitignore', 'LICENSE')) {
    Copy-Item (Join-Path $root $file) $stage
}
# Scripts referenced by package.json (npm run pack / pack:repo / deploy) must
# ship with the repo, otherwise a fresh clone cannot build.
foreach ($file in @('build-backend.ps1', 'package-flexplugin.ps1', 'make-repo-package.ps1', 'install.ps1')) {
    Copy-Item (Join-Path $root $file) $stage
}
Copy-Item (Join-Path $root 'src\plugin.js') (Join-Path $stage 'src')
Copy-Item (Join-Path $root 'test\verify.js') (Join-Path $stage 'test')

Copy-Item (Join-Path $pluginSrc 'manifest.json') (Join-Path $stage 'com.nanqing.apiusage.plugin')
Copy-Item (Join-Path $pluginSrc 'config.json') (Join-Path $stage 'com.nanqing.apiusage.plugin')
Copy-Item (Join-Path $pluginSrc 'ui\*.vue') (Join-Path $stage 'com.nanqing.apiusage.plugin\ui')

# Keep the backend/ directory in git even though its only file is generated.
Set-Content -Path (Join-Path $stage 'com.nanqing.apiusage.plugin\backend\.gitkeep') -Value '' -NoNewline

Remove-Item $outZip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $stage -DestinationPath $outZip -Force
Remove-Item $stageRoot -Recurse -Force

Write-Host "REPO_PACKAGE=$outZip"
