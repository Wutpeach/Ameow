[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReleaseTool,[Parameter(Mandatory)][string]$EvidenceDirectory)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not [IO.Path]::IsPathFullyQualified($EvidenceDirectory) -or (Test-Path -LiteralPath $EvidenceDirectory)) { throw 'Choose a new absolute evidence directory.' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$prepared = Join-Path (Split-Path -Parent $ReleaseTool) 'prepared'
& $ReleaseTool verify $prepared
if ($LASTEXITCODE -ne 0) { throw 'Unsigned release inputs failed verification.' }
$cases=@('unsigned-inputs-verified')
$previousCi=$env:CI
try {
    $env:CI='true'
    $private=Join-Path $EvidenceDirectory 'must-not-exist.pk8'
    & $ReleaseTool keygen $private (Join-Path $EvidenceDirectory 'must-not-exist.hex') *> (Join-Path $EvidenceDirectory 'ci-keygen.txt')
    if ($LASTEXITCODE -ne 2 -or (Test-Path -LiteralPath $private) -or (Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'ci-keygen.txt') -Raw) -notmatch 'E_RELEASE_OFFLINE_OWNER_ONLY') { throw 'CI key generation was not blocked before output.' }
    & $ReleaseTool sign $prepared $private (Join-Path $EvidenceDirectory 'must-not-exist-signed') 1 1 *> (Join-Path $EvidenceDirectory 'ci-sign.txt')
    if ($LASTEXITCODE -ne 2 -or (Test-Path -LiteralPath (Join-Path $EvidenceDirectory 'must-not-exist-signed')) -or (Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'ci-sign.txt') -Raw) -notmatch 'E_RELEASE_OFFLINE_OWNER_ONLY') { throw 'CI signing was not blocked before output.' }
    $cases+=@('ci-keygen-no-output','ci-sign-no-output')
} finally { $env:CI=$previousCi }
@{result='PASS';checks=$cases;count=$cases.Count;productionPrivateKeyCreated=$false} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json')
exit 0
