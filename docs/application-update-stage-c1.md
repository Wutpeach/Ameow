# Windows release preparation — Stage C1

Scope: [#33 C1](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6733821585). This is controlled infrastructure, not permission to commit, push, create a tag/draft or publish. Production public roots remain empty; license Gate B and product/ordinary-user/Shell gates remain independent and blocked/pending. No installer or launcher self-update is introduced.

## Build once, keep the bytes

The existing scripts/package_portable.ps1 remains the build entry. Its old BuildOnly and hash-bound private-owner-validation behavior is preserved. The new explicit combination builds the application, Launcher and offline tool from the same locked Rust 1.93.0 / Windows x64 MSVC source using static CRT:

~~~powershell
./scripts/package_portable.ps1 -BuildOnly -ReleasePreparation -TargetDirectory D:/task/c1-target -OutputDirectory D:/task/c1-build-01
~~~

Use absolute, separate task-owned paths outside the source package. Output must not exist. Dependencies must already be available to the offline Cargo build; CI first fetches the locked graph. Do not replace an accepted EXE or reuse an old review for new inputs. Cargo.lock, runtime sources and pinned versions are unchanged.

The build records actual HEAD/tree, dirty/untracked source state, the full source/resource inventory digest, Cargo.lock digest, toolchain/target, Cargo version and actual PE ProductVersion. Source and packaging inputs are compared before/after compilation. release-build.json binds these to the exact application/Launcher size and SHA-256, the public-root snapshot and exact license materials. input-manifest.json retains the detailed inventory; release-tool.json identifies the owner tool. A Tag build must be a clean checkout at the exact existing v<Cargo version> tag/commit. No command creates a Tag.

ReleasePreparation copies only named license materials and records their actual hashes alongside the existing inventory hashes in material-audit.json. Historical hash differences remain visible; it does not rewrite the reviewed inventory or declare a license review passed. Every controlled Build explicitly records license_review=not-evaluated. The historical private Gate A review remains required by private-owner-validation; C1 candidates carry CONTROLLED / NOT FOR DISTRIBUTION and public_gate_b=blocked. No runtime component, old cache or user data is copied. These candidate bytes must not be distributed while license gaps remain.

## Distinct archives

| Artifact | Exact use and members |
| --- | --- |
| Ameow-<version>-windows-x64.zip | Application updater only. Exactly one regular member: Ameow.exe. No Launcher, state, README or licenses inside this ZIP; those remain in the separate portable distribution. |
| Ameow-<version>-windows-x64-portable-CONTROLLED.zip | First extraction candidate. AmeowLauncher.exe; versions/<version>/Ameow.exe and manifest.json; state.json; release-identity.json; README.txt; CONTROLLED.txt; LICENSE and exact named license materials. Never pass this ZIP to the in-app updater. |

The first portable state has pending only, no fabricated current/previous/trial. It records the signed sequence and payload digest. The unchanged Launcher verifies the version's signed manifest and exact executable bytes, then starts a trial; only the real application's nonce/PID/build-version Ready handshake commits current. Failure retains the existing fail-closed/rollback behavior. There is no unsigned bootstrap bypass. Extract the whole ZIP to a new writable directory, preferably %LOCALAPPDATA%/Programs/Ameow, then launch AmeowLauncher.exe. User data remains %LOCALAPPDATA%/Ameow. The format needs no admin rights, but a clean ordinary-user first installation is still an unverified product gate.

With keys: [], the ordinary production build can prepare/verify an unsigned update plan; it cannot sign a trusted candidate or bootstrap a usable production installation. The tool never substitutes the RFC fixture key. A debug-only release_fixture example proves the separate portable protocol using accepted local fixture binaries and an explicitly synthetic source identity; it is not a production release or license approval.

## Offline owner operations — future explicit authorization required

The following are operational instructions, not commands executed during C1. Do not generate or activate production keys until the owner separately approves the trusted public roots. Use an offline owner-controlled machine/directory with owner-only ACLs, encrypted storage and an encrypted backup. Keep private keys outside every Git checkout, build/candidate directory, CI workspace and cloud-synced folder. Never put private bytes in environment variables, arguments, logs, artifacts or Releases.

The release build produces ameow-release.exe. It has no network/publishing commands. keygen writes a PKCS#8 private file and a raw lowercase 32-byte Ed25519 public key in hex to two new files. It refuses Git paths for private keys, existing outputs and CI execution. sign also refuses CI and private keys under candidate/output directories. The tool does not manage filesystem ACLs or encrypted backups; the owner must establish those before invocation.

~~~powershell
# Only after a separate owner decision, in a secure offline directory:
& D:/verified-tools/ameow-release.exe keygen X:/offline-keys/ameow-2026.pk8 X:/offline-keys/ameow-2026-public.hex
& D:/verified-tools/ameow-release.exe import-public D:/review/old-public-roots.json X:/offline-keys/ameow-2026-public.hex D:/review/proposed-public-roots.json
~~~

Review/fingerprint the proposed PUBLIC roots independently, then import only those public bytes into assets/app-update-trust.json under a separately approved source change. Rebuild application, Launcher and release tool with the approved roots: the release tool also checks its compiled version/root identity against the candidate. The private key never enters the repo or build. import-public preserves prior keys in a new file, rejects duplicate keys and the known RFC fixture key, and does not overwrite the source trust file. Verify the release tool's own provenance and hash before transferring it offline. See [C2 owner preparation](application-update-stage-c2.md) for the unexecuted custody/approval checklist.

Review the detailed source inventory and the exact build bytes on the offline machine. Copy the complete controlled build directory or prepared candidate, never a private key, to the preparation directory. A source commit alone does not identify a dirty local build; inspect source_sha256 and input-manifest.json too. Do not recompress or rebuild the update ZIP after signing.

~~~powershell
& D:/verified-tools/ameow-release.exe prepare D:/review/c1-build D:/review/prepared-01
& D:/verified-tools/ameow-release.exe verify D:/review/prepared-01
# Use a new globally monotonic sequence and actual current Unix signing time; no expiry:
& D:/verified-tools/ameow-release.exe sign D:/review/prepared-01 X:/offline-keys/ameow-2026.pk8 D:/review/signed-01 <sequence> <issued-unix>
& D:/verified-tools/ameow-release.exe verify-signed D:/review/signed-01 D:/trusted-copy/approved-public-roots.json
~~~

The application manifest remains schema 1 and the accepted domain-separated Ed25519 protocol. It binds stable version/platform/origin, monotonic sequence, signing provenance and exact ZIP/EXE size/hash. A separate domain-separated signed release identity binds that manifest and ZIP to source commit/tree/tag, dirty inventory, Launcher and notices without changing the application schema. Verification requires the owner's independent trusted public-root file; it never trusts a root merely because the artifact carries it. The external verification report includes portable ZIP/member hashes. Portable initialization metadata is checked against the signed manifest, not accepted as an arbitrary installed state.

The [0.5.0 permanent-release decision](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6759540545) supersedes the earlier seven-day acquisition policy. Manifests have no expires field or expiry parameter. Signing time is provenance with a future-time sanity check, never a deadline; installation, update acquisition/preparation and offline launch remain valid indefinitely without periodic re-signing. Signed versions/sequences and local state still prevent downgrade/replay. Unknown keys, invalid signatures, wrong identity, reparse paths, unexpected/duplicate/case-colliding members and symlinks fail closed. Unpublished draft manifests carrying expires are rejected; regenerate them with the new tool, preserving historical evidence.

Both application and stable Launcher embed their own public roots. The single-EXE update ZIP never replaces the Launcher. An application-only bridge that adds a new key therefore cannot rotate an installed Launcher's trust. A future switch requires a separately approved manual replacement of the stable Launcher with matching approved roots, or a backup public key already embedded in both binaries at initial distribution. Merely removing a key from a later application does not revoke that key in an old Launcher. Each accepted public key is an alternative signer, not a multi-party quorum. C1 adds no automatic Launcher update, rotation or online revocation service. If a key is lost, another key is usable only if both installed binaries already trust it; otherwise stop automatic publishing and arrange an owner-verified manual replacement. If compromise is suspected, stop preparation/distribution, assess every client that still trusts the key, and use an independent owner-verified recovery channel. Never disable signature verification to recover. These limits are included in the C2 owner decision list.

## Existing GitHub Actions, controlled reports only

.github/workflows/rust.yml keeps main/PR check and tests, and adds locked release preparation for main/PR/manual runs and audits existing v* tags. The runner has contents: read only. It fetches locked dependencies, builds offline with the existing script, verifies the actual update ZIP and command boundaries, and uploads only named JSON build/check reports for 14 days. It uploads no EXE/ZIP, invokes no private-key command except rejection tests, uses no signing secret and has no draft/tag/release job. public-release remains an unconditional failure in both the old packaging entry and new tool.

Reference inspected: Clackly main.yml and workflow-release.yml at commit 8d28021e6860cbf260f4f3cd46d85c9a7abe0a5c. Ameow borrows exact source/tag/byte verification, separate evidence and limited publication authority. Clackly's Inno/Electron/runtime bundle and draft job are not adopted.

windows-latest supplies x64 MSVC and Windows SDK; rustup installs 1.93.0. GPUI builds still need the Windows SDK/resource compiler, matching locked Rust dependencies and adequate disk/time. No interactive desktop/GPUI acceptance is claimed on the Actions runner. A/B/C1 were uncommitted at C1 validation and were subsequently accepted in local commit 1f4b3f21d7e770d427d7bcec109cc647014ce6ff; they remain unpushed and this workflow has not executed remotely. YAML/PowerShell/local build checks must not be described as remote CI PASS.

Remaining separate decisions/gates: owner-approved production public roots and offline key custody; license Gate B; explicit commit/push/tag/draft/public-release authorization; remote runner execution; real ordinary-user first install, actual Medium Explorer tray interaction and signed HTTPS update assets. Historical Electron v0.3.1 is untouched.
