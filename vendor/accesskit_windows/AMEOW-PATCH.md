# Ameow #32: Windows callbacks after TLS teardown

This directory preserves the published `accesskit_windows 0.34.0` source.
Package checksum: `106c2b961215864d1c2e703ee63269c25c4e80a577ffb2c1017b9c17dcdf83a1`.
Upstream revision: `c88605b96d04431f9c3c792464a0f2f253480e94`,
[`platforms/windows`](https://github.com/AccessKit/accesskit/tree/c88605b96d04431f9c3c792464a0f2f253480e94/platforms/windows).
The MIT and Apache licenses are preserved from that revision.

The only runtime change is in `src/util.rs`: `StringBuffer` treats its TLS pool
as an optional optimization. If Windows COM/IME thread teardown dispatches a
focus event after the pool is destroyed, acquisition uses a fresh buffer and
drop releases it without returning it to the pool. Accessibility events and
normal buffer reuse remain enabled. No GPUI API, version or window lifecycle
is changed.

The added subprocess regression invokes the real buffer implementation after
the pool's TLS destructor. Before the fix its child aborts with AccessError /
`0xC0000409`; after the fix conversion storage can be used and released.
The other util tests cover normal reuse, simultaneous leases and memory bounds.

```powershell
cargo test --manifest-path vendor/accesskit_windows/Cargo.toml --target-dir target --locked --lib util::tests:: -- --nocapture
```

The crate's own lockfile and build output are excluded from Git; Ameow's root
lockfile controls product builds. Upstream examples and test sources remain
intact; their native window tests are not run by the util filter.
On a fresh checkout, omit `--locked` for the first standalone test run to create
the crate's independent test lockfile; subsequent runs can use the command above.
Remove this `[patch.crates-io]` override when a compatible upstream release
contains the equivalent lifetime fix and passes the targeted native exit check.
