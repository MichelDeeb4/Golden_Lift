param(
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$DisplayName
)
$ErrorActionPreference='Stop'
$taskNode=Get-Command node -ErrorAction SilentlyContinue
$taskNodePath=if($taskNode){$taskNode.Source}else{'C:\Program Files\nodejs\node.exe'}
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskEntry=Join-Path $taskRoot 'services\identity\dist\composition\bootstrap.js'
if(-not(Test-Path -LiteralPath $taskEntry)){throw 'Run backend.ps1 -Action build first.'}
$taskPassword=Read-Host 'Initial Super Admin password (15 to 128 characters)' -AsSecureString
$taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword)
$taskPreviousEmail=$env:BOOTSTRAP_EMAIL
$taskPreviousName=$env:BOOTSTRAP_DISPLAY_NAME
$taskPreviousPassword=$env:BOOTSTRAP_PASSWORD
Push-Location $taskRoot
try {
  $env:BOOTSTRAP_EMAIL=$Email
  $env:BOOTSTRAP_DISPLAY_NAME=$DisplayName
  $env:BOOTSTRAP_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
  & $taskNodePath $taskEntry
  if($LASTEXITCODE -ne 0){throw 'Super Admin bootstrap failed. See the safe error above.'}
} finally {
  $env:BOOTSTRAP_EMAIL=$taskPreviousEmail
  $env:BOOTSTRAP_DISPLAY_NAME=$taskPreviousName
  $env:BOOTSTRAP_PASSWORD=$taskPreviousPassword
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
  $taskPassword.Dispose()
  Pop-Location
}

