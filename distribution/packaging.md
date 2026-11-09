# Windows x64 private validation packaging

For #33's Launcher-based controlled release preparation, see [Stage C1](../docs/application-update-stage-c1.md). The existing entry can use -BuildOnly -ReleasePreparation to build/audit the application, Launcher and offline tool together. This produces an unsigned controlled update plan and reports; the distinct first-extraction portable ZIP requires owner-side signature verification. It does not replace the historical private review below, enable a public package, generate a production key or upload binaries.

This entry preserves the TRA-23 private validation protocol. A private ZIP requires an actual review bound to the current build inputs; #18 uses BuildOnly and does not renew an older review. Every private package carries `PRIVATE LOCAL VALIDATION — NOT FOR DISTRIBUTION`. Do not share or upload it. Public Gate B remains blocked and public release is not authorized; a successful private build never clears it. Product and clean ordinary-user acceptance remain separate.

Use 64-bit PowerShell on Windows and the locked Rust MSVC toolchain. The script resolves its package root from its own location. Supply separate task-owned target/output directories outside the source package. Output must not already exist. No file is deleted, existing package overwritten, old runtime copied, or repository tree staged. Cargo can reuse only the chosen task-owned target. Use new task-owned paths and preserve historical evidence and targets.

Without -ReleasePreparation, build-only creates an EXE and evidence, without evaluating Gate A or making a ZIP:

~~~powershell
& ./scripts/package_portable.ps1 -TargetDirectory D:/task/r12-static-build -OutputDirectory D:/task/r12-build-evidence-01 -BuildOnly
~~~

An actual owner-only review is necessary for packaging:

~~~powershell
& ./scripts/package_portable.ps1 -TargetDirectory D:/task/r12-static-build -OutputDirectory D:/task/r12-private-package-01 -PackageMode private-owner-validation -LicenseReviewFile D:/task/r12-private-review.json
~~~

`-PackageMode public-release` always fails before creating output, even if the supplied private review passed. An absent mode, conflicting `-BuildOnly` and mode, missing review, blocked private material, or changed input also fails. Do not make an approval or remove an obligation merely to generate a ZIP.

## Actual minimum material inventory and review

`distribution/license-inputs.json` is a reviewed source input, prepared from the actual embedded/static-linked content and the on-demand runtime model. It has schema 1, scope `private-owner-validation`, a nonempty `materials` array, and a `publicGateB` object with status `blocked` and nonempty blockers. Each material records `kind`, the real `obligation`, repository-relative `source`, named package `destination`, and uppercase SHA256. The source `LICENSE` must map to the visible root destination `LICENSE`. Third-party materials remain separate under `licenses/`. Never list the inventory itself in `materials`: the script binds and copies it automatically, avoiding a self-referential hash.

The separate review file uses schema 2:

~~~text
schema: 2
scope: private-owner-validation
baselineHead: exact current full HEAD
sourceInventorySha256: actual full sorted source/resource/license input digest
cargoLockSha256: actual uppercase Cargo.lock SHA256
runtimeManifestSha256: actual uppercase assets/runtime-manifest.json SHA256
licenseInputsSha256: actual uppercase distribution/license-inputs.json SHA256
reviewer: actual reviewing role/person
reviewedAtUtc: actual ISO8601 timestamp
evidence: nonempty list of real research/evidence references
privateGateA:
  status: minimum-materials-verified (only after the real checks)
  useModel: owner-only-controlled-device
  blockers: empty only when actual private minimum obligations are closed
publicGateB:
  status: blocked
  blockers: actual outstanding public-release items and authorization
notices: exact source/destination/sha256 entries for every materials item
~~~

This describes the interface, not a valid review or a legal conclusion. A review must match the inventory exactly with no omitted, duplicated or substituted material. Reviewer/time/evidence and separate blocked public state are mandatory. Unknown actual minimum obligations block Gate A; public-only gaps stay in Gate B instead of being misreported as cleared.

The source inventory includes Cargo.toml, Cargo.lock, LICENSE, all indexed/untracked nonignored src/assets files, distribution/license-inputs.json and distribution/notices files. Its digest covers the sorted record array serialized by PowerShell `ConvertTo-Json -Depth 5 -Compress`, UTF-8 without BOM. Every record has relative path, bytes and uppercase SHA256. This binds actual uncommitted sources, embedded resources and notice/input files, not just Git HEAD. The lock/runtime/requirements hashes are additionally checked explicitly. Build-only can provide this digest when all materials are present; a historical digest cannot approve changed inputs.

Eligible sources are root LICENSE, reviewed text files ending .txt/.md/.json under distribution/notices/, and existing assets/LICENSE, runtime-notices.md, runtime-GPL-3.0.txt and fonts/OFL.txt. Third-party destinations must be under licenses/ with .txt/.md/.json suffixes. Traversal, duplicate destinations (case insensitive on Windows), symlink/reparse files, missing texts and incorrect hashes fail. `licenses/license-inputs.json` is reserved for the actual inventory. BuildOnly intentionally does not require private license clearance.

## Controlled build and archive proof

The build is `cargo build --locked --offline --release --target x86_64-pc-windows-msvc --bin ameow`, with `RUSTFLAGS=-C target-feature=+crt-static`. The explicit target separates host procedural macros. Unexpected Rust flags/wrappers/target overrides are rejected. Environment and working directory are restored in `finally`, including failed review/build paths. Missing offline dependencies are a truthful failure. Independently inspect PE imports and verify stock Windows compatibility; static CRT does not replace build-context license evidence.

The manifest records HEAD/tree, source/resource/license hashes, source changes, implementation/test inputs, toolchain, dependency graph, pinned runtime manifest, new EXE size/hash, Gate A review hash and blocked Gate B. Inputs, implementation, review and HEAD must remain unchanged during compilation. Build logs remain outside the ZIP. Dependency SPDX metadata is inventory information, not substitute notice text or source-obligation review.

Only named members are added to `Ameow_PRIVATE_windows_x64_portable.zip`: Ameow.exe, README.txt, input-manifest.json, PRIVATE-LOCAL-VALIDATION.txt, licenses/license-inputs.json, visible LICENSE and the exact reviewed notice destinations. A .NET ZIP writer adds each member explicitly, without recursive discovery. The external package-manifest.json records every member size/hash and final ZIP size/hash. Independently extract the real package, compare the complete member set and all hashes, and prove the private marker and blocked public state. Rebuilding requires new evidence.

yt-dlp, Deno and FFmpeg/ffprobe are checked after startup and fetched when missing or damaged into user LocalAppData from the compiled pinned manifest. No managed tools/cache/user output are bundled. The Chinese guide explains direct launch. Ordinary launch, stock Chinese fonts, first-use/reuse, relocation, permission failures, native foreground Downloading Cancel and safe Exit need actual application evidence. An elevated development-host run does not establish clean non-admin acceptance. Commit, archive, push, public release and uploads are outside this script.
