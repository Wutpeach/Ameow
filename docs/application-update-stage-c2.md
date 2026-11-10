# Windows public-distribution review and signing preparation — Stage C2

Scope: [#33 C2 instruction](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6734985761), based on accepted local commit 1f4b3f21d7e770d427d7bcec109cc647014ce6ff. This is engineering evidence and owner preparation, not legal clearance, public-release approval or key activation. Gate B remains blocked; production keys remain empty. No production private key was generated, read or uploaded. No application/Launcher code, dependency, runtime download mechanism or version is changed.

## Gate B findings (2026-11-09)

| Existing blocker | Established engineering facts | Remaining condition / decision |
| --- | --- | --- |
| External redistribution, source and third-party coverage | The Windows normal/build graph has 419 third-party packages, unchanged in name/version/checksum from the historical inventory. All 419 cached crate archives match Cargo.lock; 739 recorded text mappings / 276 unique text bodies are intact. Application and update ZIPs do not bundle the managed media tools. | Four exact package-text gaps remain. Confirm notice delivery for every distributed binary, including updates, and the actual runtime acquisition/integration/source obligations. No license scanner output or successful build grants clearance. |
| Historical icon tag and upstream text provenance | Nine later SVGs match Lucide 0.468.0 child geometry. Both embedded JetBrains Mono fonts match the official v2.304 Git blob identities. Full Lucide ISC/Feather MIT attribution is now preserved. | The immediate historical tag for x/check/copy is still unknown. Four crate source-text gaps below remain. Brand artwork comes from the approved Penpot export; owner confirmation of creation/redistribution rights is still required. A comparison tag is not invented historical provenance. |
| MSVC static generated-binary redistribution | C1 records Rust 1.93.0 / Windows x64 MSVC / static CRT. The actual Community 2022 terms and official Distributable List have been obtained; no compiler, SDK or separate VC runtime installer is bundled. | Owner must confirm the actual individual/organizational development context and applicable license eligibility. Review Section 4 conditions and downstream terms for the generated/static binary. No separate runtime DLL does not mean no Microsoft terms apply. |
| Public release authorization | C1 and local-commit acceptance are limited. No push/tag/release or Gate B change is authorized. | Separate owner authorization after the substantive conditions and product gates are independently satisfied. Both public-release commands remain unconditional rejection paths. |

The static-link dependency metadata uses permissive alternatives/conditions, including Apache/LLVM, ISC, BSD and Unicode terms; this does not relicense third-party code under Ameow's MIT. Ring includes separately mapped BoringSSL/other-bits notices; GPUI 0.2.2 is assessed as its scoped crate, not by assuming the whole Zed repository's license. The build graph includes build tools/procedural macros and is not a precise linker map. No claim is made that all 419 packages are shipped as runtime code.

The historical inventory's Cargo.lock digest is caa8ad607610947dcc8d11207ed5f4f94f0891d6a09cd6df577ec66e78dc1ede; the accepted current lock digest is dbea2f455e56e9c20cb8917bf69aa18413fb21b38e6976316d535fd9fba44f69. Package/checksum comparison, rather than replacing that historical field, establishes the unchanged third-party graph. Of the 739 mappings, 716 point to checked crate members and 23 to previously recorded pinned upstream texts; all bodies were rehashed locally. Those 23 upstream URLs were not all fetched again. This is material integrity evidence, not an independent legal determination of every source mapping.

### Four unresolved exact-text gaps

| Locked package | Source evidence checked | Remaining gap |
| --- | --- | --- |
| convert_case 0.4.0 (declared MIT) | Crate checksum and .cargo_vcs_info.json pin 300d9eef9e8c970e15f324afbc3df8b6a4ebbf71; [upstream tree](https://github.com/rutrum/convert-case/tree/300d9eef9e8c970e15f324afbc3df8b6a4ebbf71). | The published crate and inspected upstream root omit a full license body. Metadata alone is not a recovered copyright/grant notice. |
| mac 0.1.1 (declared MIT/Apache-2.0) | Locked archive, metadata and [upstream repository](https://github.com/reem/rust-mac). | No full license file in the crate/inspected root, and no packaged VCS revision. Exact release source/text correspondence still needs confirmation. |
| seahash 4.1.0 (declared MIT) | Locked archive; VCS pin 94b632aeac099031c373599313d5b5f0acbbaec0; [versioned upstream README](https://gitlab.redox-os.org/redox-os/seahash/-/raw/94b632aeac099031c373599313d5b5f0acbbaec0/README.md). | The release crate and checked README do not supply the missing full notice. No template copyright was invented. |
| simd_helpers 0.1.0 (declared MIT) | Locked archive; VCS pin ca1a2f84aa386d758e98f8a609d990263932fb85; [upstream tree](https://github.com/lu-zero/simd_helpers/tree/ca1a2f84aa386d758e98f8a609d990263932fb85). | The published crate and inspected upstream root omit a full license body. |

Minimum next action: owner decides how to obtain an authoritative grant/text or a qualified assessment that the available version-specific declarations suffice. Dependency changes, substitute assets or contacting upstream are separate work; C2 does not fabricate a generic MIT notice, change dependencies or assert that these declarations are legally invalid.

## Seven historical material differences

The original inventory and all C1 reports/builds remain in Git/history and their original evidence directories. The before/after hashes and recovered historical bytes are in the C2 audit directory, not overwritten into old evidence.

| Material | C1 difference | C2 treatment and source |
| --- | --- | --- |
| assets/fonts/OFL.txt | CRLF versus inventoried LF | Restored exact inventoried LF bytes. Text equals official [JetBrains Mono v2.304 OFL](https://github.com/JetBrains/JetBrainsMono/blob/cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9/OFL.txt). Both font binaries match that tag. |
| distribution/notices/rust-standard-library-notices.txt | CRLF versus LF | Restored exact Rust 1.93.0 installed COPYRIGHT-library.html bytes and original inventory hash. |
| distribution/notices/rust-standard-library-MIT.txt | CRLF versus LF | Restored exact installed licenses/MIT.txt bytes and original hash. |
| distribution/notices/rust-standard-library-Apache-2.0.txt | CRLF versus LF | Restored exact installed licenses/Apache-2.0.txt bytes (including installed exception text) and original hash. |
| assets/runtime-GPL-3.0.txt | CRLF versus LF | Restored original LF hash; equals the full [FFmpeg n9.0.2 COPYING.GPLv3](https://github.com/FFmpeg/FFmpeg/blob/946fcce07b6dcd0331c8cc609192aeff5e1924f8/COPYING.GPLv3) text. |
| distribution/notices/icon-licenses.txt | Actual content added after the old inventory | Old digest is recovered exactly from 4280d142's parent at the historical ameow-next path. The added nine-icon source record is verified. The exact Lucide ISC copyright line, including Cole Bemis/Feather attribution, replaces the incomplete generic line; full Feather MIT remains. assets/LICENSE has the same corrected notice. |
| distribution/notices/runtime-acquisition.md | Actual FFmpeg change and gallery-dl addition in 122c47b9 | The old digest is recovered from that commit's parent. Current identities/hashes match runtime-manifest.json; the delivery declaration now includes gallery-dl, manual yt-dlp upgrades and explicit public/source-review limits. |

The two content updates and the corrected MSVC reference receive new exact material hashes only after this source review. Five LF restorations keep their old inventory hashes. Git attributes preserve the exact license bodies and inventory bytes across checkouts; verification still compares raw SHA-256 and never silently normalizes a mismatched review. The private Gate A review remains bound to its original source/material hashes; any candidate made from these changed inputs needs a new real review. Gate B status and its four blockers are unchanged. An internally consistent material list is not a public-completeness certificate.

### Assets and runtime boundaries

- JetBrains Mono v2.304 commit cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9: Regular and Medium Git blob identities match the official font directory. OFL permission/conditions and copyright remain accompanying notices. No font modification or system Chinese-font copying is introduced.
- Lucide 0.468.0 commit f12b0de177fbc2a6795e99be065887e72b237123: all nine later SVG child geometries match; sizing/stroke/tint adaptations are documented. [Exact ISC text](https://github.com/lucide-icons/lucide/blob/f12b0de177fbc2a6795e99be065887e72b237123/LICENSE) includes the Feather attribution. [Feather v4.29.2 MIT](https://github.com/feathericons/feather/blob/24c23655d77f46af2d81bd48eabb3d81ada5f562/LICENSE) is retained separately. No SVG is changed.
- Brand ICO/tray PNGs retain the approved Penpot export/source manifest. That proves the recorded export chain, not a third-party rights assignment; owner confirms the right to distribute the artwork.
- yt-dlp baseline 2026.08.19: source is Unlicense; the official bundled EXE has bundled dependency terms/GPL context. [Versioned THIRD_PARTY_LICENSES.txt](https://github.com/yt-dlp/yt-dlp/blob/3a08beaf031ab68f966401ead017ac81fe8486cf/THIRD_PARTY_LICENSES.txt) supplies notices/source contacts. A source-repository license alone is not the EXE's complete classification. Managed later upgrades need release-specific review if redistribution is proposed.
- Deno 2.9.7: the project's [MIT license](https://github.com/denoland/deno/blob/0c071246a412575e07423263404a5d13e7ed6aa2/LICENSE.md) is not the entire binary's V8/third-party inventory.
- FFmpeg/Gyan 9.0.2 essentials: pinned archive and files remain unchanged. Upstream [LICENSE.md](https://github.com/FFmpeg/FFmpeg/blob/946fcce07b6dcd0331c8cc609192aeff5e1924f8/LICENSE.md) explains --enable-gpl / --enable-version3 and external-library terms. The annotated tag object ce8f11b9fac4cd7ccfb41ca7c01bc17f5cda8cc3 points to source commit 946fcce07b6dcd0331c8cc609192aeff5e1924f8; they are different object types, not contradictory source versions. Binary redistribution would require the actual build configuration, dependency/source correspondence and applicable notices, not just a link to vanilla FFmpeg. ffmpeg.org/legal.html could not be fetched in C2 because of a TLS EOF; the versioned official source license was obtained instead.
- gallery-dl 1.32.19: declared GPL-2.0-only; [versioned GPLv2 text](https://github.com/mikf/gallery-dl/blob/b1e05e3b3b3df4c4fd35d9c357b9af24a2934890/LICENSE) is obtained. The standalone's Python/dependency and separate VC++ x86 prerequisite remain distinct from Ameow's static x64 build. No redistributable installer or mirror is added.

The current application ZIP does not include any of these managed runtime executables. Direct download and separate subprocess execution are engineering facts; C2 does not infer that they settle every copyright, combined-work or corresponding-source question. No runtime EXE/archive was freshly downloaded or redistributed for this review.

**Notice delivery for updates is still open.** The single-EXE update ZIP contains no license files, and the updater does not update the installation's root notices. A first-extraction portable package can carry the current notices, but that alone does not establish how newly changed notices accompany later EXE copies. Before public updates, owner must approve an assessed delivery mechanism/policy for exact per-version notices/source materials (and any required product work). C2 keeps the accepted ZIP contract and does not invent an exemption, add an unapproved UI or declare a sidecar link sufficient.

## MSVC evidence and owner questions

The former provenance note linked a Diagnostics product license. It now links the actual [Community 2022 portal](https://visualstudio.microsoft.com/license-terms/vs2022-ga-community/), its [English terms DOCX](https://visualstudio.microsoft.com/wp-content/uploads/2021/11/Visual-Studio-2022-Community-License-EN.docx), [official Distributable List](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution) and [VC++ redistribution guidance](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170). Download receipts and extracted paragraphs are preserved locally.

Section 1 distinguishes individual/organizational use. Section 4 grants conditional Distributable Code rights and states requirements including substantial application functionality and downstream terms protecting that code, plus restrictions. Whether/how these apply to the exact static CRT/generated binary and Ameow's intended terms must be confirmed for the actual license context. The C1 compiler flags and observed imports alone cannot answer that. Owner should identify the development/distribution entity and confirm eligibility, applicable generated-code terms and necessary downstream notices/terms; obtain qualified advice if unresolved. C2 makes no claim that purchasing a new license or using a traditional installer is required.

## Production signing: unexecuted owner runbook

All commands below are for a future separately approved owner session. C2 executes none of the key-generation/import/signing commands and does not locate or inspect private-key files. The accepted tool remains useful for preparation, but production signing requires the compiled roots/version of the tool and candidate to agree.

### 1. Approve custody before generating anything

Choose an owner-controlled offline machine and a new directory on encrypted storage, outside Git/build/output/cloud-sync folders. On Windows, require a filesystem with ACL support, check for reparse points, remove inherited broad access, verify the owner-only permissions and ensure encrypted offline backup media is ready before keygen. Do not disable system protections to prepare the machine. The tool writes a plaintext PKCS#8 file: it does not encrypt it, set ACLs or provide a keystore. Encrypt storage and backup; keep backup-unlock material separately under the owner's control. An ACL alone is not protection from an already compromised/elevated host.

After the owner has verified that X: is the intended encrypted ACL-capable volume, this future example creates a NEW directory and limits its inherited access. It must not be run against an existing directory or a reparse path:

~~~powershell
$signingDirectory = 'X:/AmeowSigning'
if (Test-Path -LiteralPath $signingDirectory) { throw 'Choose a new signing directory' }
New-Item -ItemType Directory -Path $signingDirectory -ErrorAction Stop | Out-Null
$signingOwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$aclGrant = '*' + $signingOwnerSid + ':(OI)(CI)F'
& icacls $signingDirectory /inheritance:r /grant:r $aclGrant
if ($LASTEXITCODE -ne 0) { throw 'ACL setup failed; do not generate a key' }
& icacls $signingDirectory
if ($LASTEXITCODE -ne 0) { throw 'ACL inspection failed; do not generate a key' }
~~~

Owner must inspect the effective permissions, parent/reparse path, encryption and backup before continuing; this example is not an automatic proof of the security of the volume or host. Do not expose a backup-unlock secret in the shell or agent session.

Record the audited release tool's SHA-256 and source/build provenance on an independent trusted device. Transfer and recheck it offline. Do not infer that a binary is trusted merely because it calls itself ameow-release.exe. The production private bytes never enter agent prompts, terminal output, environment variables, command arguments, Git, CI secrets/artifacts or Releases. Commands use a private file path, not private contents.

### 2. Generate only after that separate approval

Use two new output paths in the already secured directory. A future example is:

~~~powershell
& D:/verified-tools/ameow-release.exe keygen X:/AmeowSigning/ameow-primary.pk8 X:/AmeowSigning/ameow-primary-public.hex
if ($LASTEXITCODE -ne 0) { throw 'Key generation failed; stop the ceremony' }
~~~

Immediately retain an encrypted offline backup and a separate trusted copy of the public key/fingerprint. Owner should verify a restored backup during the future controlled signing rehearsal; C2 has not performed that ceremony. Keygen refuses existing outputs, Git private-key paths and CI, but those guards do not prove offline custody or encryption.

### 3. Independently approve the public root

Fingerprint the decoded 32 public bytes, not an accidentally newline-dependent file. This future PowerShell 7 example reads PUBLIC data only:

~~~powershell
$publicHex = (Get-Content -LiteralPath X:/AmeowSigning/ameow-primary-public.hex -Raw).Trim()
if ($publicHex -cnotmatch '^[0-9a-f]{64}$') { throw 'Invalid public key format' }
$publicBytes = [Convert]::FromHexString($publicHex)
[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($publicBytes)).ToLowerInvariant()
& D:/verified-tools/ameow-release.exe import-public D:/review/old-public-roots.json X:/AmeowSigning/ameow-primary-public.hex D:/review/proposed-public-roots.json
if ($LASTEXITCODE -ne 0) { throw 'Public import failed; do not approve a root' }
Get-FileHash -LiteralPath D:/review/proposed-public-roots.json -Algorithm SHA256
~~~

Compare the raw-key fingerprint and exact proposed-root file hash on two independently trusted copies/devices. Record only public values, key purpose and custody owner. import-public creates a new file, retains prior roots, and rejects a duplicate or the known RFC fixture key. It never establishes a key's owner identity. The proposed file is not approved merely because it was generated by the tool. Only a separately authorized reviewed source change may copy the approved public bytes into assets/app-update-trust.json. Current production keys stay empty.

### 4. Rebuild all three binaries with identical approved roots

After the future public-root source change is reviewed and committed under separate authorization, use the approved exact source revision and new task-owned paths. Build without app-update-fixture; no private key goes to the build machine or CI:

~~~powershell
./scripts/package_portable.ps1 -BuildOnly -ReleasePreparation -TargetDirectory D:/builds/ameow-approved-target-01 -OutputDirectory D:/review/ameow-approved-build-01
~~~

This rebuilds Ameow.exe, AmeowLauncher.exe AND ameow-release.exe. The last one also checks its compiled version and roots against Build; the old empty-root C1 release tool must not be used to sign a candidate built with new roots. Inspect actual commit/tree/source digest, Cargo.lock, target/version, root-file identity, notices and all three binary hashes. Retain the unchanged input-manifest.json and byte-identical prepared update ZIP. A historical C1 EXE/ZIP cannot be relabeled as a production-root build.

The current C1 format is still CONTROLLED / NOT FOR DISTRIBUTION with license_review=not-evaluated and Gate B blocked. Key provisioning does not make it a public product. Neither command creates a Tag or publishes a Release; the public-release command remains disabled.

### 5. Owner signs and verifies offline only after candidate approval

Transfer the approved candidate and the newly rebuilt, independently hash-checked tool to the offline owner. Use a new signed output directory. The owner maintains an append-only public release-sequence ledger; a greater sequence is required for each newly offered authorization. Use a correct clock for signing provenance. The [0.5.0 decision](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6759540545) supersedes the former seven-day policy: signed assets are permanent, with no expires field, deadline parameter or periodic re-signing. Installation and update preparation share this policy while preserving signature, hash, identity and sequence checks.

~~~powershell
& D:/verified-tools/ameow-release.exe verify D:/review/ameow-approved-build-01/prepared
if ($LASTEXITCODE -ne 0) { throw 'Candidate verification failed; do not sign' }
$sequence = [UInt64](Read-Host 'Enter the approved globally increasing release sequence')
$issued = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
& D:/verified-tools/ameow-release.exe sign D:/review/ameow-approved-build-01/prepared X:/AmeowSigning/ameow-primary.pk8 D:/review/signed-01 $sequence $issued
if ($LASTEXITCODE -ne 0) { throw 'Signing failed; do not publish' }
& D:/verified-tools/ameow-release.exe verify-signed D:/review/signed-01 D:/trusted-copy/approved-public-roots.json
if ($LASTEXITCODE -ne 0) { throw 'Signed candidate verification failed' }
~~~

Use the independently approved PUBLIC roots file, never a root supplied only inside the candidate. In an actual ceremony, stop after any failed command and do not proceed to publication. Retain the public verification report, signed manifest/release identity, exact ZIP/EXE/member hashes, source/root identity, sequence/times and operator confirmation; never retain or upload private bytes in those reports. Do not recompress or rebuild the signed ZIP. A future restored-backup rehearsal should verify against the same independent public roots, using a separate controlled output and no publishing. Test fixture trust is not acceptable evidence of production trust.

### 6. Decide rotation and recovery before the first installed population

The Launcher and application each embed roots; the update ZIP only carries Ameow.exe. Adding key B to an app signed by key A does not add B to the old Launcher. The C1 rotation paragraph is corrected accordingly. Automatic Launcher replacement/revocation is not implemented and is not added in C2.

Owner must choose a documented initial policy: one primary key with an independently verified manual replacement recovery path, or a primary plus separately held backup key already embedded in BOTH binaries at initial release. Multiple roots are alternative authorized signers: any one can sign, and compromise of any trusted private key matters; this is not a 2-of-2 approval rule. A future switch can use an already trusted backup; introducing an unknown key requires separately approved manual Launcher/root replacement and client-coverage evidence.

Loss with no surviving key trusted by both binaries requires an independently authenticated manual replacement; do not weaken signature verification. Suspected compromise requires stopping preparation/distribution and assessing all clients still trusting that key. Removing it from a newer application does not revoke it from an old Launcher. There is no online revocation authority or automatic safe rescue channel. Owner must approve the recovery/notification mechanism and its trust evidence before relying on it.

## Owner decision list and retained gates

1. Confirm artwork redistribution rights and how to resolve the three old-icon tag / four crate full-text gaps; obtain qualified review where source declarations are insufficient.
2. Confirm the actual entity's Visual Studio use eligibility and static generated-code/downstream terms.
3. Approve an assessed runtime integration/acquisition/source boundary and exact per-release notice/source delivery, especially single-EXE updates. Approving direct-download mode alone is not full legal clearance.
4. Choose signing custody owner, encrypted offline storage/backup/rehearsal, independent public-fingerprint review and initial key/recovery policy. Actual keygen/public-root changes remain separately authorized future actions.
5. After substantive review and product verification, decide separately on public Gate B and any push/tag/release/public-publishing implementation. C2 neither authorizes nor performs them.

Remote GitHub Actions, true Medium Explorer tray interaction, clean ordinary-user first extraction/start, and a real production-signed HTTPS update remain pending. C2 runs no unrelated UI/native tests, changes no permission/session environment and reuses accepted A/B/C1 evidence. Full local source audit evidence, seven-item before/after hashes, upstream receipts, boundary checks and preservation records are under D:/Ameow/evidence/issue33-stage-c2-20261109/. The Issue report carries the actual check results. No new commit is created for C2.
