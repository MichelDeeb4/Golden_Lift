param(
    [Parameter(Position=0)]
    [ValidateSet('all','init','start','setup','seed','test','verify','manifest','backup','status','stop')]
    [string]$Action = 'status'
)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} else {
    $nodeExecutable = Join-Path $env:ProgramFiles 'nodejs\node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    throw 'Node.js is required. Install it or add node.exe to PATH.'
}
& $nodeExecutable (Join-Path $PSScriptRoot 'scripts\db.mjs') $Action
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
