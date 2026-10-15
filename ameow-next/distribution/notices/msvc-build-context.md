# MSVC build-tool identity note

Research date: 2026-10-13. Read-only inspection of the Windows build host found Visual Studio Community 2022 installation version 17.14.36915.13, product display version 17.14.25 (January 2026), and MSVC toolset directory 14.44.35207. Invoking that installation's x64 cl.exe with /Bv reported compiler 19.44.35222.0 and linker 14.44.35222.0.

The R10 static-build evidence describes the Ameow executable as built for x86_64-pc-windows-msvc with static CRT enabled and reports no VCRUNTIME140 or API-MS-WIN-CRT imports. Retain the original R10 build manifest as the evidence for the candidate executable; the host installation query alone does not cryptographically bind a toolchain version to a particular executable.

The compiler, linker, SDK, and Visual Studio installation are host build tools. They are not members of the owner-only Portable ZIP. The observed executable imports do not show a separately shipped VC runtime DLL. The environment query does not establish who accepted the Visual Studio terms or whether the installation is licensed to an individual or organization. Record the toolchain identity as provenance; assess any applicable generated-binary redistribution terms separately before distributing binaries to others. This note is not a legal conclusion or a clearance.

Official references: Visual Studio 2022 license terms https://visualstudio.microsoft.com/license-terms/vs2022-ga-diag/ ; Microsoft VC++ file redistribution overview https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170 .
