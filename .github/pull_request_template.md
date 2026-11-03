## Change

Describe the user-visible problem and resulting behavior. Link the relevant Issue.

## Evidence

List checks actually run and their results. UI changes need the affected Windows workflow and compact screenshots. Reuse applicable evidence and name unverified behavior.

Rust: `cargo check --locked --all-targets`, relevant `cargo test --locked` targets.
Docs: `npm ci --prefix site` and `npm --prefix site run build`.

## Risks

State compatibility, data/ownership and platform limits. Building does not authorize public release or clear license/product gates.
