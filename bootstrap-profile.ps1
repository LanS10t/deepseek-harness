[CmdletBinding()]
param(
    [string]$DshHome,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$seed = Join-Path $repo 'local-plugins/profile'
$files = @('package.json', 'cordis.yml', 'cordis.patch.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')

if (-not (Test-Path -LiteralPath $seed)) {
    throw "Profile seed missing at $seed."
}

if (-not $DshHome) {
    $DshHome = Join-Path $repo '.storages/dsh-home'
}
$dest = Join-Path $DshHome 'profiles/web'

# The seed's dependency paths climb four levels to reach the repository root, so
# they resolve only at <repo>/.storages/dsh-home/profiles/web, the DSH home that
# start.ps1 pins.
$probe = Join-Path $dest '../../../../local-plugins/vendor/dsh-skill-mcp-panel-2.0.4.tgz'
if (-not (Test-Path -LiteralPath $probe)) {
    throw "The seed resolves only when the destination is <repo>/.storages/dsh-home/profiles/web; $dest is not."
}

if ((Test-Path -LiteralPath (Join-Path $dest 'package.json')) -and -not $Force) {
    throw "A profile already exists at $dest. Stop the running DSH, then pass -Force to replace it."
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $seed $file) -Destination $dest -Force
}

Push-Location -LiteralPath $dest
try {
    & corepack pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm install exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "Web profile installed at $dest."
Write-Host 'Start the harness with .\start.ps1'
