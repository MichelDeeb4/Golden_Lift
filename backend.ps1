param(
  [ValidateSet('build','typecheck','lint','check','test','test:integration','smoke','smoke:identity','auth:setup','dev','orm:generate','orm:check','orm:format','orm:verify','orm:pull')]
  [string]$Action = 'check'
)
$ErrorActionPreference = 'Stop'
$taskNode = Get-Command node -ErrorAction SilentlyContinue
$taskNodePath = if ($taskNode) { $taskNode.Source } else { 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $taskNodePath)) { throw 'Node.js 24.21 or later in the 24.x line is required.' }
$env:PATH = (Split-Path -Parent $taskNodePath) + ';' + $env:PATH
Push-Location $PSScriptRoot
try {
  $taskNpm = Join-Path (Split-Path -Parent $taskNodePath) 'node_modules\npm\bin\npm-cli.js'
  & $taskNodePath $taskNpm run $Action
  exit $LASTEXITCODE
} finally { Pop-Location }

