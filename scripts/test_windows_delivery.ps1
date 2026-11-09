#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SignedDirectory,
    [Parameter(Mandatory)][string]$ReleaseTool,
    [Parameter(Mandatory)][string]$TrustedPublicRoots,
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [string]$Iscc = "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($EvidenceDirectory) -or (Test-Path -LiteralPath $EvidenceDirectory)) { throw 'Choose a new absolute evidence directory.' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$package = Join-Path $PSScriptRoot 'package_windows.ps1'
$common = @{SignedDirectory=$SignedDirectory; ReleaseTool=$ReleaseTool; TrustedPublicRoots=$TrustedPublicRoots; Iscc=$Iscc}
$checks = @()
function Reject([string]$Name, [scriptblock]$Action, [string]$Expected) {
    $output = Join-Path $EvidenceDirectory $Name
    try { & $Action $output; throw 'Unexpected packaging success.' } catch {
        if ($_.Exception.Message -notlike "$Expected*") { throw }
        if (Test-Path -LiteralPath $output) { throw 'Rejected packaging created output.' }
        $_.Exception.Message | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "$Name.txt") -Encoding utf8
    }
}
Reject 'public' { param($out) & $package @common -OutputDirectory $out -Fixture -PackageMode public-release } 'PUBLIC_GATE_B_BLOCKED:'
$checks += 'public-mode-rejected-before-output'
Reject 'production' { param($out) & $package @common -OutputDirectory $out } 'E_APP_UPDATE_TRUST_NOT_CONFIGURED:'
$checks += 'empty-production-root-rejected-before-output'
$broken = Join-Path $EvidenceDirectory 'tampered-source'
New-Item -ItemType Directory -Path $broken | Out-Null
foreach ($file in Get-ChildItem -LiteralPath $SignedDirectory -File) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $broken $file.Name) }
$portable = @(Get-ChildItem -LiteralPath $broken -Filter '*portable-CONTROLLED.zip')[0]
Add-Type -AssemblyName System.IO.Compression
$version = (Get-Content -LiteralPath (Join-Path $broken 'release-build.json') -Raw | ConvertFrom-Json).version
$zip = [IO.Compression.ZipArchive]::new([IO.File]::Open($portable.FullName, [IO.FileMode]::Open), [IO.Compression.ZipArchiveMode]::Update)
try {
    $name = "versions/$version/Ameow.exe"
    $zip.GetEntry($name).Delete()
    $stream = $zip.CreateEntry($name).Open()
    try { $stream.WriteByte(1) } finally { $stream.Dispose() }
} finally { $zip.Dispose() }
Reject 'tampered' { param($out) & $package -SignedDirectory $broken -ReleaseTool $ReleaseTool -TrustedPublicRoots $TrustedPublicRoots -OutputDirectory $out -Fixture -Iscc $Iscc 2> (Join-Path $EvidenceDirectory 'tampered-stderr.txt') } 'SIGNED_DELIVERY_REQUIRED:'
$checks += 'tampered-portable-rejected-before-output'
$valid = Join-Path $EvidenceDirectory 'valid'
& $package @common -OutputDirectory $valid -Fixture
$delivery = Get-Content -LiteralPath (Join-Path $valid 'delivery.json') -Raw | ConvertFrom-Json
if ($delivery.mode -cne 'FIXTURE-NOT-FOR-DISTRIBUTION' -or $delivery.publicGateB -cne 'blocked' -or $delivery.installer.bytes -le 0) { throw 'Missing controlled installer identity.' }
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipArchive]::new([IO.File]::OpenRead((Join-Path $valid $delivery.update.path)), [IO.Compression.ZipArchiveMode]::Read)
try {
    if ($zip.Entries.Count -ne 1 -or $zip.Entries[0].FullName -cne 'Ameow.exe') { throw 'Application update is not a single-EXE ZIP.' }
} finally { $zip.Dispose() }
$checks += @('installer-compiled-from-verified-portable','shared-core-and-notice-hashes','single-exe-update-preserved')
$result = @{result='PASS';checks=$checks;count=$checks.Count;nativeInstallerExecution=$false;productionPrivateKeyCreated=$false;publicGateB='blocked';delivery='valid/delivery.json'}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json') -Encoding utf8
$result | ConvertTo-Json -Depth 5
# Expected release-tool rejections leave LASTEXITCODE=2.
exit 0
