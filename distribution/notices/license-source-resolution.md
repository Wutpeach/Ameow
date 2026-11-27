# Supplementary license sources

The locked source audit did not find separate license files for the two packages
below. The supplied terms now have explicit sources; this does not assert that
either historical crate included those files or a copyright notice.

## mac 0.1.1

Locked commit: 66afc663b68a65633ea165c742b5a9c6734581c2 in
[reem/rust-mac](https://github.com/reem/rust-mac/tree/66afc663b68a65633ea165c742b5a9c6734581c2).
Both the original Cargo.toml and README declare MIT/Apache-2.0; README says
“MIT/Apache-2.0, like rust itself”. Their exact bytes are retained in
upstream/mac-0.1.1-Cargo.toml and upstream/mac-0.1.1-README.md and pinned by
license-compaction-inputs.json.

This distribution selects the declared Apache-2.0 option and includes the
[ASF standard license text](https://www.apache.org/licenses/LICENSE-2.0.txt),
SHA256 cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30.
This full text already exists in the checked shared license container; it is
mapped to the component without adding another copy to the payload. This is a
standard-text reference supported by the locked source declaration, not a claim
that the package originally included that file. No copyright holder or year is
inferred from its authors metadata.

## seahash 4.1.0

Locked source commit: 94b632aeac099031c373599313d5b5f0acbbaec0.
The source declares MIT but omits a license file. Upstream's directly following
commit [3088c5c9](https://gitlab.redox-os.org/redox-os/seahash/-/commit/3088c5c912b70b586d27bf553fbe964e025a2c89),
titled “fix: add missing MIT license text”, adds the complete permission and
warranty text. Its [original LICENSE bytes](https://gitlab.redox-os.org/redox-os/seahash/-/raw/3088c5c912b70b586d27bf553fbe964e025a2c89/LICENSE)
are preserved as upstream/seahash-LICENSE-supplement.txt, SHA256
23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3.
The same bytes already exist in the checked shared container, so only the source
mapping is added. They are expressly identified as an upstream supplement;
neither this text nor the examined locked source provides a copyright notice.

The inventory's packageTextGaps describes supplied-text coverage. Historical
upstream omissions remain in upstreamLicenseFileOmissions and per-package source
records. Generation checks preserve source hashes and full legal wording; they
do not constitute legal approval or replace the remaining source disclosures.
