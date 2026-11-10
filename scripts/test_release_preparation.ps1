[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReleaseTool,[Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not [IO.Path]::IsPathFullyQualified($EvidenceDirectory) -or (Test-Path -LiteralPath $EvidenceDirectory)) { throw 'Choose a new absolute evidence directory.' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cases=@()
$publicOutput=Join-Path $EvidenceDirectory 'forbidden-public-output'
try {
    & (Join-Path $PSScriptRoot 'package_portable.ps1') -PackageMode public-release -TargetDirectory (Join-Path $EvidenceDirectory 'unused-target') -OutputDirectory $publicOutput
    throw 'Public package unexpectedly succeeded.'
} catch {
    if ($_.Exception.Message -notlike 'PUBLIC_GATE_B_BLOCKED:*') { throw }
    if (Test-Path -LiteralPath $publicOutput) { throw 'Blocked public packaging created output.' }
    $cases+='public-package-no-output'
}
& $ReleaseTool public-release *> (Join-Path $EvidenceDirectory 'public-command.txt')
if ($LASTEXITCODE -ne 2 -or (Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'public-command.txt') -Raw) -notmatch 'PUBLIC_GATE_B_BLOCKED') { throw 'Offline tool public boundary failed.' }
$cases+='public-tool-blocked'
$previousCi=$env:CI
try {
    $env:CI='true'
    $private=Join-Path $EvidenceDirectory 'must-not-exist.pk8'
    & $ReleaseTool keygen $private (Join-Path $EvidenceDirectory 'must-not-exist.hex') *> (Join-Path $EvidenceDirectory 'ci-keygen.txt')
    if ($LASTEXITCODE -ne 2 -or (Test-Path -LiteralPath $private) -or (Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'ci-keygen.txt') -Raw) -notmatch 'E_RELEASE_OFFLINE_OWNER_ONLY') { throw 'CI key generation was not blocked before output.' }
    & $ReleaseTool sign $EvidenceDirectory $private (Join-Path $EvidenceDirectory 'must-not-exist-signed') 1 1 *> (Join-Path $EvidenceDirectory 'ci-sign.txt')
    if ($LASTEXITCODE -ne 2 -or (Test-Path -LiteralPath (Join-Path $EvidenceDirectory 'must-not-exist-signed')) -or (Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'ci-sign.txt') -Raw) -notmatch 'E_RELEASE_OFFLINE_OWNER_ONLY') { throw 'CI signing was not blocked before output.' }
    $cases+=@('ci-keygen-no-output','ci-sign-no-output')
} finally { $env:CI=$previousCi }
$requirements=Get-Content -LiteralPath (Join-Path $root 'distribution/license-inputs.json') -Raw | ConvertFrom-Json
if ($requirements.publicGateB.status -cnotin @('blocked', 'approved')) { throw 'Unknown public material review.' }
@{result='PASS';checks=$cases;count=$cases.Count;productionPrivateKeyCreated=$false;publicGateB=$requirements.publicGateB.status} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json')
# Expected command rejections leave LASTEXITCODE=2; successful verification must return 0.
exit 0
