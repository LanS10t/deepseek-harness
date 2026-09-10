[CmdletBinding()]
param(
    [ValidateRange(0, 65535)]
    [int]$Port = 3080,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$previousHome = $env:DSH_HOME

Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules/tsx')) {
        throw 'Dependencies missing. Run: corepack pnpm install --frozen-lockfile'
    }
    if (-not (Test-Path -LiteralPath 'apps/web/dist/index.html')) {
        throw 'Build missing. Run: corepack pnpm run build'
    }

    $env:DSH_HOME = Join-Path $PSScriptRoot '.storages/dsh-home'
    $cliArgs = @('pnpm', 'dsh', 'web', '--host', '127.0.0.1', '--port', "$Port")
    if ($NoOpen) {
        $cliArgs += '--no-open'
    }

    & corepack @cliArgs
    if ($LASTEXITCODE -ne 0) {
        throw "DSH exited with code $LASTEXITCODE."
    }
}
finally {
    $env:DSH_HOME = $previousHome
    Pop-Location
}
