# Windows release inputs

The single build entry is scripts/package_portable.ps1. It builds Ameow.exe, AmeowLauncher.exe, ameow-cli.exe, ameow-browser-host.exe and the offline ameow-release.exe, then prepares the single-EXE update ZIP and unsigned plan. It never signs or uploads.

~~~powershell
./scripts/package_portable.ps1 -TargetDirectory D:/AmeowRelease/target -OutputDirectory D:/AmeowRelease/candidate/build
~~~

Use Rust 1.98.1 / Windows x64 MSVC and prepare the locked dependencies for the offline build. The build uses static CRT, separate target/output directories and a fresh output directory. Existing evidence and output are never overwritten.

No approval status, review file, reviewer identity or version Tag is needed to build. The former Gate A/B paths and BuildOnly/ReleasePreparation/PackageMode combination are removed. Local dirty builds may prepare unsigned development inputs; their dirty identity is recorded and they cannot be signed as production releases. For a release, invoke the same script from an independent clean checkout of a definite Commit; leave unrelated development changes alone. A version Tag is checked only when supplied by a Tag-triggered CI run, or at final publication.

The build records Commit/tree, actual source/resource hashes, Cargo.lock, toolchain and binary identities. Inputs and packaging implementation must remain unchanged during compilation and staging. distribution/license-inputs.json contains material source/destination hashes and informational obligations, with no approval fields. LICENSE and THIRD_PARTY_NOTICES are mandatory; only named text materials are copied, paths and duplicate names are checked, and actual bytes must match the inventory. The inventory itself is included without a self-referential hash.

Use the existing offline sign and verify-signed commands, then scripts/package_windows.ps1 for Inno and portable delivery. Empty production roots, test roots, mismatched compiled version/roots, unclean or synthetic production source identity, invalid signatures, altered ZIP/EXE/notices and invalid members remain rejected. The public RFC fixture root is usable only in explicit debug/test builds and yields visibly marked fixture artifacts. It cannot authorize normal Windows delivery.

Production private keys stay outside Git and candidate directories, under the publisher's custody; CI cannot generate or use them. No Authenticode certificate is required by these tools. Actual third-party license/source/attribution and publisher eligibility obligations remain the publisher's responsibility; notes in the inventory are disclosures, not packaging switches.

## Signing and delivery

Use a separate clean checkout for the selected application commit. Fetch the locked Windows dependencies before the offline build:

```powershell
cargo +1.98.1 fetch --locked --target x86_64-pc-windows-msvc
```

The build produces `release-build.json`, `ameow-release.exe` and `prepared/`. Check the recorded commit/tree, `dirty=false`, version, platform and compiled production public keys. A tag is not required at build time. Do not mix outputs from different builds.

Use the release tool from that same build to verify the prepared inputs, sign, then verify against an independently trusted public-root copy:

```powershell
& $releaseTool verify $preparedDirectory
if ($LASTEXITCODE -ne 0) { throw 'Prepared input rejected' }
& $releaseTool sign $preparedDirectory $privateKeyPath $signedDirectory $sequence $issued
if ($LASTEXITCODE -ne 0) { throw 'Signing rejected' }
& $releaseTool verify-signed $signedDirectory $trustedPublicRoots
if ($LASTEXITCODE -ne 0) { throw 'Signed input rejected' }
```

Set these variables to the candidate's paths before running the commands. Stop after any nonzero exit; do not continue packaging failed inputs. `$sequence` is a positive integer greater than every previously issued value; never sign different manifests with the same sequence, including local candidates. `$issued` is the current Unix time in seconds; a value more than 300 seconds ahead of the receiving clock is rejected. Manifests have no expiry field. Keep the signing sequence and candidate hashes outside the source checkout.

Reuse the publisher's existing production key. `keygen <private.pk8> <public.hex>` is only for establishing a new signing identity and refuses existing outputs; it writes an unencrypted PKCS#8 key. `import-public <trust-template.json> <public.hex> <new-public-roots.json>` prepares public roots. Only public trust material belongs in the repository. A changed trust root requires matching application, Launcher and release-tool builds; a public key taken from an untrusted candidate is not an independent trust anchor. Keep private keys and backups out of Git, CI, logs, discussions and delivery directories.

Pass the verified signed directory to [Windows delivery](windows-delivery.md). On Apple Silicon Mac, build `ameow`, `ameow-updater`, `ameow-cli` and `ameow-browser-host` and use [package_macos.sh](../scripts/package_macos.sh); Windows delivery commands do not produce a Mac app.

## Release checks

Ameow [0.5.0 is publicly released](https://github.com/Wutpeach/Ameow/releases/tag/v0.5.0). For each subsequent candidate:

- Verify installation, portable startup through the Launcher, real Ready confirmation, the displayed version and offline notices. Exercise affected update/recovery paths while preserving existing user data and the original candidate.
- Confirm altered inputs are rejected using an isolated copy. Build success and signature checks alone do not prove the native workflow.
- Before publishing, check the destination repository, exact tag-to-build commit and asset hashes. Never move an existing release tag or overwrite published assets. Publish only the named platform assets, not entire build/signing directories.
- After publishing, fetch the real HTTPS update manifest and archive, verify signatures and hashes against the delivered candidate, and check the app's update result. Preserve the source commit, public roots, sequence and delivery hashes. Proposed URLs or a successful upload command do not prove public availability.

Application signing and publication remain explicit publisher operations; CI does neither. Documentation-only commits may follow the application build commit without changing the published binary's identity.

## Dependency review scope

Known license-text gaps and attribution limits are retained in [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md), the [dependency inventory](notices/rust-dependency-inventory.json), [MSVC context](notices/msvc-build-context.md) and [runtime acquisition](notices/runtime-acquisition.md). A release does not resolve these disclosures.

The 2026-11-10 dependency review recorded zip 2.4.2 stream/extract/password advisories, rustls 0.23.45 Brotli/session Debug/cache/ECH advisories, and grid 0.18.0 `expand_rows` overflow. That review did not establish their complete trigger paths in the examined application; it was not a claim that the dependencies were vulnerability-free or that alerts were resolved. For a new release, assess the current lockfile, enabled features and actual API use against applicable upstream advisories. Do not treat that historical assessment as approval of a changed dependency graph.
