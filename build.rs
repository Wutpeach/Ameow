use std::{env, fs, path::PathBuf};
#[path = "build_support/notices.rs"]
mod notices;

fn main() {
    println!("cargo:rerun-if-env-changed=AMEOW_FIXTURE_BUILD_VERSION");
    println!("cargo:rerun-if-changed=assets/brand");
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    for input in [notices::SOURCE, notices::INVENTORY, notices::PACKAGES, "build_support/notices.rs"]
        .into_iter().chain(notices::TEXTS.iter().copied()) {
        println!("cargo:rerun-if-changed={input}");
    }
    let version = if env::var_os("CARGO_FEATURE_APP_UPDATE_FIXTURE").is_some()
        && env::var("PROFILE").as_deref() == Ok("debug") {
        env::var("AMEOW_FIXTURE_BUILD_VERSION").unwrap_or_else(|_| env::var("CARGO_PKG_VERSION").unwrap())
    } else { env::var("CARGO_PKG_VERSION").unwrap() };
    let text = notices::assemble(&root, &version).expect("Third-party notice material must be complete and hash-verified");
    fs::write(out.join("third_party_notices.txt"), text).expect("Write embedded notices");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let mut rc = format!(
        "1 ICON \"{}\"\n",
        root.join("assets/brand/ameow.ico").display()
    )
    .replace('\\', "/");
    let version = env::var("CARGO_PKG_VERSION").unwrap();
    let version_parts = format!(
        "{},{},{},0",
        env::var("CARGO_PKG_VERSION_MAJOR").unwrap(),
        env::var("CARGO_PKG_VERSION_MINOR").unwrap(),
        env::var("CARGO_PKG_VERSION_PATCH").unwrap()
    );
    rc.push_str(&format!(
        r#"
1 VERSIONINFO
 FILEVERSION {version_parts}
 PRODUCTVERSION {version_parts}
 FILETYPE 1
BEGIN
    BLOCK "StringFileInfo"
    BEGIN
        BLOCK "040904B0"
        BEGIN
            VALUE "FileDescription", "Ameow"
            VALUE "FileVersion", "{version}"
            VALUE "OriginalFilename", "Ameow.exe"
            VALUE "ProductName", "Ameow"
            VALUE "ProductVersion", "{version}"
        END
    END
    BLOCK "VarFileInfo"
    BEGIN
        VALUE "Translation", 0x0409, 1200
    END
END
"#
    ));
    for (id, folder) in [
        (101, "follow-appearance/light"),
        (102, "follow-appearance/night"),
        (103, "ameow-blue"),
        (104, "apricot"),
    ] {
        // ICO is only a container: keep every delivered PNG frame byte-for-byte.
        let frames: Vec<_> = [16u8, 20, 24, 32, 40, 48, 64]
            .into_iter()
            .map(|size| {
                let png =
                    fs::read(root.join(format!("assets/brand/tray/{folder}/{size}.png"))).unwrap();
                (size, png)
            })
            .collect();
        let mut ico = vec![0, 0, 1, 0, frames.len() as u8, 0];
        let mut offset = 6 + frames.len() as u32 * 16;
        for (size, png) in &frames {
            ico.extend_from_slice(&[*size, *size, 0, 0, 1, 0, 32, 0]);
            ico.extend_from_slice(&(png.len() as u32).to_le_bytes());
            ico.extend_from_slice(&offset.to_le_bytes());
            offset += png.len() as u32;
        }
        for (_, png) in &frames {
            ico.extend_from_slice(png);
        }
        let path = out.join(format!("tray-{id}.ico"));
        fs::write(&path, ico).unwrap();
        rc.push_str(&format!("{id} ICON \"{}\"\n", path.display()).replace('\\', "/"));
    }
    let resource = out.join("brand.rc");
    fs::write(&resource, rc).unwrap();
    embed_resource::compile_for(resource, ["ameow"], embed_resource::NONE)
        .manifest_required()
        .expect("Windows brand icons must be embedded");
}
