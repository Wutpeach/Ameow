# Development

Use the repository root for Rust work. `rust-toolchain.toml` pins the verified MSVC toolchain. Windows x64 is the current implementation platform; macOS and Linux native support are not verified.

- `src/`, `tests/`, `examples/`: application, contracts and development probes.
- `assets/`: embedded brand assets, fonts, trust material and runtime manifest.
- `distribution/`: license material and controlled private packaging.
- `scripts/`: retained native validation/capture tools and packaging entry.
- `site/`: independent Astro/Starlight site and lockfile.
- `openspec/specs/`: the only active formal contracts; start at [OpenSpec](openspec/README.md).
- [Spec maintenance and source limits](docs/spec-maintenance.md): update rules, evidence limits and migration provenance.
- [Engineering guides and history](docs/README.md): current preview/release guides and availability of historical sources; external backups have been removed at the user's request.

```powershell
cargo check --locked --all-targets
cargo test --locked
```

Run the narrowest relevant test first. Genuine runtime/media tests are explicitly ignored by default and require their documented inputs; ignored is not PASS. Native UI changes require running the affected workflow. Existing accepted evidence can be reused when its source and behavior remain applicable.

Optional Windows screenshot tools need Python, Tk and Pillow; see [UI_REGRESSION.md](scripts/UI_REGRESSION.md). They can move the real pointer and should run only on their owned process. Preserve accepted executables with a separate target/output directory. They are development tools, not product acceptance or cross-platform proof.

The current build entry prepares unsigned release inputs; signing and publication are separate. The historical BuildOnly/Gate A/B interfaces are retired:

```powershell
./scripts/package_portable.ps1 -TargetDirectory D:/task/ameow-target -OutputDirectory D:/task/ameow-build-evidence
```

Use new task-owned paths. Full packaging rules and release limits are in [distribution/packaging.md](distribution/packaging.md). Historical private reviews do not approve a renamed or changed build. CI checks Windows Rust and builds Pages; there is no tag-driven release workflow.

The site requires Node >=22.19.0. Use `npm ci --prefix site`, `npm --prefix site run dev` or `npm --prefix site run build`; no root Node package is needed.

GitHub Issues carry current authorization. Historical Linear/Trellis instructions and archived reports are evidence only. Do not migrate legacy paths, delete old worktrees or rewrite history as routine housekeeping; consult [the historical-source index](docs/README.md#历史资料). Keep ordinary stage handoffs in the relevant Issue/PR or Cindy history, and use a task-owned directory or the ignored root evidence/ directory for new validation output.
