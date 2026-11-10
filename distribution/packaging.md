# Windows release inputs

The single build entry is scripts/package_portable.ps1. It builds Ameow.exe, AmeowLauncher.exe and the offline ameow-release.exe, then prepares the single-EXE update ZIP and unsigned plan. It never signs or uploads.

~~~powershell
./scripts/package_portable.ps1 -TargetDirectory D:/AmeowRelease/target -OutputDirectory D:/AmeowRelease/0.5.0/build
~~~

Use Rust 1.98.1 / Windows x64 MSVC and prepare the locked dependencies for the offline build. The build uses static CRT, separate target/output directories and a fresh output directory. Existing evidence and output are never overwritten.

No approval status, review file, reviewer identity or version Tag is needed to build. The former Gate A/B paths and BuildOnly/ReleasePreparation/PackageMode combination are removed. Local dirty builds may prepare unsigned development inputs; their dirty identity is recorded and they cannot be signed as production releases. For a release, invoke the same script from an independent clean checkout of a definite Commit; leave unrelated development changes alone. A version Tag is checked only when supplied by a Tag-triggered CI run, or at final publication.

The build records Commit/tree, actual source/resource hashes, Cargo.lock, toolchain and binary identities. Inputs and packaging implementation must remain unchanged during compilation and staging. distribution/license-inputs.json contains material source/destination hashes and informational obligations, with no approval fields. LICENSE and THIRD_PARTY_NOTICES are mandatory; only named text materials are copied, paths and duplicate names are checked, and actual bytes must match the inventory. The inventory itself is included without a self-referential hash.

Use the existing offline sign and verify-signed commands, then scripts/package_windows.ps1 for Inno and portable delivery. Empty production roots, test roots, mismatched compiled version/roots, unclean or synthetic production source identity, invalid signatures, altered ZIP/EXE/notices and invalid members remain rejected. The public RFC fixture root is usable only in explicit debug/test builds and yields visibly marked fixture artifacts. It cannot authorize normal Windows delivery.

Production private keys stay outside Git and candidate directories, under the owner's offline custody; CI cannot generate or use them. No Authenticode certificate is required by these tools. Actual third-party license/source/attribution and publisher eligibility obligations remain the publisher's responsibility; notes in the inventory are disclosures, not packaging switches.

See [the current release steps](../docs/first-rust-release.md) and [Windows delivery](windows-delivery.md). Historical stage reports describe their then-current interfaces; do not reuse the retired approval-file commands.
