#[path = "../build_support/notices.rs"]
mod notices;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn source() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}
fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for path in [notices::SOURCE, notices::INVENTORY, notices::PACKAGES]
        .into_iter()
        .chain(notices::TEXTS.iter().copied())
    {
        let dest = dir.path().join(path);
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        fs::copy(source().join(path), dest).unwrap();
    }
    dir
}
fn review(root: &Path, path: &str, text: &[u8]) {
    fs::write(root.join(path), text).unwrap();
    let mut inventory: Value =
        serde_json::from_slice(&fs::read(root.join(notices::INVENTORY)).unwrap()).unwrap();
    let record = inventory["materials"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|r| r["source"] == path)
        .unwrap();
    record["sha256"] = format!("{:x}", Sha256::digest(text)).into();
    fs::write(
        root.join(notices::INVENTORY),
        serde_json::to_vec(&inventory).unwrap(),
    )
    .unwrap();
}

#[test]
fn embedded_notices_preserve_full_materials_and_package_attribution() {
    let text = notices::assemble(&source(), ameow_next::app_update::BUILD_VERSION).unwrap();
    assert_eq!(text, ameow_next::third_party_notices::TEXT);
    for path in notices::TEXTS {
        if path == &notices::TEXTS[3] {
            assert!(text.contains("Alliance for Open Media Patent License 1.0"));
            assert!(text.contains("“Affiliate”"));
            assert!(!text.contains('\u{fffd}'));
        } else if path == &notices::TEXTS[6] {
            assert!(
                text.contains(
                    &notices::standard_library_text(
                        &fs::read_to_string(source().join(path)).unwrap()
                    )
                    .unwrap()
                )
            );
            assert!(!text.contains("<details>"));
        } else {
            assert!(
                text.contains(&fs::read_to_string(source().join(path)).unwrap()),
                "{path}"
            );
        }
    }
    let packages: Value =
        serde_json::from_slice(&fs::read(source().join(notices::PACKAGES)).unwrap()).unwrap();
    for package in packages["packages"].as_array().unwrap() {
        assert!(text.contains(&format!(
            "{}@{}",
            package["name"].as_str().unwrap(),
            package["version"].as_str().unwrap()
        )));
        for license in package["texts"].as_array().unwrap() {
            assert!(text.contains(license["bodyAnchor"].as_str().unwrap()));
        }
    }
    assert!(text.contains("Cole Bemis"));
    assert!(text.contains("Exact license-text source remains unresolved."));
    assert!(!text.contains("<!-- include:"));
}

#[test]
fn missing_or_modified_notice_sources_fail_closed() {
    for path in [notices::SOURCE, notices::PACKAGES]
        .into_iter()
        .chain(notices::TEXTS.iter().copied())
    {
        let dir = fixture();
        fs::remove_file(dir.path().join(path)).unwrap();
        assert!(
            notices::assemble(dir.path(), "0.1.0").is_err(),
            "missing {path}"
        );
        fs::write(dir.path().join(path), "damaged or stale material").unwrap();
        assert!(
            notices::assemble(dir.path(), "0.1.0").is_err(),
            "damaged {path}"
        );
    }
}

#[test]
fn empty_invalid_utf8_and_incomplete_rehashed_materials_are_rejected() {
    for bytes in [b"  \n".as_slice(), b"\xff", b"text\0hidden"] {
        let dir = fixture();
        review(dir.path(), notices::TEXTS[1], bytes);
        assert!(notices::assemble(dir.path(), "0.1.0").is_err());
    }
    let original = fs::read_to_string(source().join(notices::SOURCE)).unwrap();
    for altered in [
        original.replace("<!-- include: LICENSE -->", ""),
        original.replace("<!-- include: LICENSE -->", "<!-- include: ../LICENSE -->"),
        original.replace(
            "<!-- include: LICENSE -->",
            "<!-- include: LICENSE -->\n<!-- include: LICENSE -->",
        ),
        original.replace("<!-- rust-packages -->", ""),
        original.replace(
            "<!-- rust-packages -->",
            "<!-- rust-packages -->\n<!-- rust-packages -->",
        ),
    ] {
        let dir = fixture();
        review(dir.path(), notices::SOURCE, altered.as_bytes());
        assert!(notices::assemble(dir.path(), "0.1.0").is_err());
    }
}

#[test]
fn each_version_keeps_its_own_notice_bytes() {
    let dir = fixture();
    let original = fs::read_to_string(dir.path().join(notices::SOURCE)).unwrap();
    review(
        dir.path(),
        notices::SOURCE,
        original
            .replace(
                "Ameow {{VERSION}}\n",
                "Ameow {{VERSION}}\nFixture A notice.\n",
            )
            .as_bytes(),
    );
    let first = notices::assemble(dir.path(), "0.2.0").unwrap();
    review(
        dir.path(),
        notices::SOURCE,
        original
            .replace(
                "Ameow {{VERSION}}\n",
                "Ameow {{VERSION}}\nFixture B notice.\n",
            )
            .as_bytes(),
    );
    let second = notices::assemble(dir.path(), "0.2.1").unwrap();
    assert!(first.contains("Ameow 0.2.0\nFixture A notice."));
    assert!(!first.contains("Fixture B notice."));
    assert!(second.contains("Ameow 0.2.1\nFixture B notice."));
    assert!(!second.contains("Fixture A notice."));
    assert!(first.ends_with("End of third-party notices for Ameow 0.2.0.\n"));
    assert!(second.ends_with("End of third-party notices for Ameow 0.2.1.\n"));
}

#[test]
fn standard_library_reader_preserves_words_entities_and_source_links() {
    let text = notices::standard_library_text("<html><head>title</head><body><h1>Copyright</h1><p>A &#34;quote&#34; &amp; &#60;owner&#62;.</p><a href=\"https://example.org/license\">Full terms</a><pre>  verbatim\n    indent</pre></body></html>").unwrap();
    assert!(text.contains("A \"quote\" & <owner>."));
    assert!(text.contains("https://example.org/license"));
    assert!(text.contains("Full terms"));
    assert!(text.contains("  verbatim\n    indent"));
    for bad in [
        "",
        "<body><script>bad</script></body>",
        "<body>&unknown;</body>",
        "<body>&#999999999;</body>",
    ] {
        assert!(notices::standard_library_text(bad).is_err());
    }
}
