//! Explicit offline owner commands. No network or GitHub publishing capability.
use ameow_next::app_update::release;
use std::path::Path;
fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let usage = "ameow-release prepare <build-dir> <new-output> | verify <prepared-dir> | verify-signed <signed-dir> <trusted-public-roots.json> | sign <prepared-dir> <external-private.pk8> <new-output> <sequence> <issued-unix> <expires-unix> | keygen <external-private.pk8> <public.hex> | import-public <old-trust.json> <public.hex> <new-trust.json>";
    let p = |i: usize| Path::new(&args[i]);
    match args.first().map(String::as_str) {
        Some("prepare") if args.len() == 3 => release::prepare(p(1), p(2)),
        Some("verify") if args.len() == 2 => release::verify(p(1)),
        Some("verify-signed") if args.len() == 3 => release::verify_signed(p(1), p(2)),
        Some("sign") if args.len() == 7 => release::sign(
            p(1),
            p(2),
            p(3),
            args[4].parse().map_err(|_| usage)?,
            args[5].parse().map_err(|_| usage)?,
            args[6].parse().map_err(|_| usage)?,
        ),
        Some("keygen") if args.len() == 3 => release::keygen(p(1), p(2)),
        Some("import-public") if args.len() == 4 => release::import_public(p(1), p(2), p(3)),
        Some("public-release") => {
            Err("PUBLIC_GATE_B_BLOCKED: publishing is not implemented or authorized".into())
        }
        _ => Err(usage.into()),
    }
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(2)
    }
}
