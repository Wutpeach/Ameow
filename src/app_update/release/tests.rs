use super::*;
use std::io::Cursor;

fn source(root: &Path) -> Build {
    fs::create_dir(root).unwrap();
    fs::create_dir(root.join("licenses")).unwrap();
    let app = b"controlled application bytes";
    let launcher = b"controlled launcher bytes";
    let cli = b"controlled CLI bytes";
    let license = b"unit fixture notice, not a distribution review";
    let third_party = b"unit third-party notice";
    let inventory = encode(&serde_json::json!({"schema":1,"materials":[
        {"destination":"LICENSE","sha256":hash(license)},
        {"destination":"licenses/THIRD_PARTY_NOTICES.md","sha256":hash(third_party)}
    ]})).unwrap();
    for (name, bytes) in [
        ("Ameow.exe", app.as_slice()),
        ("AmeowLauncher.exe", launcher.as_slice()),
        ("ameow-cli.exe", cli.as_slice()),
        ("LICENSE", license.as_slice()),
        ("licenses/THIRD_PARTY_NOTICES.md", third_party.as_slice()),
        ("licenses/license-inputs.json", inventory.as_slice()),
    ] {
        fs::write(root.join(name), bytes).unwrap();
    }
    let mut build = Build {
        schema: 3,
        version: "0.1.0".into(),
        target: TARGET.into(),
        commit: "1".repeat(40),
        tree: "2".repeat(40),
        tag: None,
        dirty: true,
        source_sha256: hash(b"unit source"),
        cargo_lock_sha256: hash(b"unit lock"),
        toolchain: "1.98.1".into(),
        trust: PublicRoots {
            schema: 1,
            keys: vec![FIXTURE_PUBLIC.into()],
        },
        app: FileRecord::of("Ameow.exe", app),
        launcher: FileRecord::of("AmeowLauncher.exe", launcher),
        cli: Some(FileRecord::of("ameow-cli.exe", cli)),
        browser: Vec::new(),
        notices: vec![
            FileRecord::of("LICENSE", license),
            FileRecord::of("licenses/THIRD_PARTY_NOTICES.md", third_party),
            FileRecord::of("licenses/license-inputs.json", &inventory),
        ],
    };
    for name in ["ameow-browser-host.exe", "browser-extension/manifest.json", "browser-extension/background.js", "browser-extension/popup.js", "browser-extension/popup.html", "browser-extension/popup.css", "browser-extension/build.json", "browser-extension/LICENSES.txt", "browser-extension/page.js", "browser-extension/page.css", "browser-extension/ameow-cat.svg", "browser-extension/icons/16.png", "browser-extension/icons/24.png", "browser-extension/icons/32.png", "browser-extension/icons/48.png", "browser-extension/icons/128.png"] {
        let bytes = format!("synthetic package member {name}").into_bytes();
        let path = root.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, &bytes).unwrap();
        build.browser.push(FileRecord::of(name, &bytes));
    }
    fs::write(root.join("release-build.json"), encode(&build).unwrap()).unwrap();
    build
}
fn prepared(tmp: &Path) -> (Build, std::path::PathBuf) {
    let input = tmp.join("input");
    let build = source(&input);
    let prepared = tmp.join("prepared");
    prepare(&input, &prepared).unwrap();
    (build, prepared)
}
fn signed_candidate(tmp: &Path) -> (Build, std::path::PathBuf) {
    signed_candidate_issued(tmp, super::super::store::now())
}
fn signed_candidate_issued(tmp: &Path, issued: u64) -> (Build, std::path::PathBuf) {
    let (build, prepared) = prepared(tmp);
    let output = tmp.join("signed");
    sign_fixture(&prepared, &output, 1, issued).unwrap();
    (build, output)
}
fn save_build(root: &Path, build: &Build) {
    fs::write(root.join("release-build.json"), encode(build).unwrap()).unwrap()
}

#[test]
fn changed_application_is_rejected_before_preparation() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    source(&input);
    fs::write(input.join("Ameow.exe"), b"substitution").unwrap();
    let output = tmp.path().join("out");
    assert!(prepare(&input, &output).is_err());
    assert!(!output.exists());
}
#[test]
fn incomplete_launcher_build_is_rejected() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    source(&input);
    fs::remove_file(input.join("AmeowLauncher.exe")).unwrap();
    assert!(prepare(&input, &tmp.path().join("out")).is_err());
}
#[test]
fn altered_cli_is_rejected_before_preparation() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    source(&input);
    fs::write(input.join("ameow-cli.exe"), b"substitution").unwrap();
    let output = tmp.path().join("out");
    assert!(prepare(&input, &output).is_err());
    assert!(!output.exists());
}
#[test]
fn wrong_version_platform_commit_and_tag_are_rejected() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    let build = source(&input);
    for case in 0..6 {
        let mut candidate = build.clone();
        match case {
            0 => candidate.version = "01.0.0".into(),
            1 => candidate.target = "aarch64-pc-windows-msvc".into(),
            2 => candidate.commit = "wrong".into(),
            3 => candidate.tag = Some("v9.9.9".into()),
            4 => candidate.tag = Some("v0.1.0".into()),
            _ => candidate.toolchain = "wrong".into(),
        };
        save_build(&input, &candidate);
        assert!(
            prepare(&input, &tmp.path().join(format!("out{case}"))).is_err(),
            "case {case}"
        );
    }
}
#[test]
fn every_archive_path_is_explicit_and_case_unique() {
    for name in [
        "../Ameow.exe",
        "/Ameow.exe",
        "C:/Ameow.exe",
        "versions/../Ameow.exe",
        "versions//Ameow.exe",
        "versions\\Ameow.exe",
    ] {
        assert!(safe_member(name).is_err(), "{name}");
    }
    let bytes = archive(&BTreeMap::from([
        ("Ameow.exe".into(), vec![1]),
        ("ameow.exe".into(), vec![2]),
    ]))
    .unwrap();
    assert!(
        members(
            &bytes,
            &BTreeSet::from(["Ameow.exe".into(), "ameow.exe".into()])
        )
        .is_err()
    );
}
#[test]
fn symlink_zip_members_are_rejected() {
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.add_symlink(
        "Ameow.exe",
        "outside",
        zip::write::SimpleFileOptions::default(),
    )
    .unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    assert!(members(&bytes, &BTreeSet::from(["Ameow.exe".into()])).is_err());
}
#[test]
fn signed_build_commit_cannot_be_substituted() {
    let tmp = tempfile::tempdir().unwrap();
    let (mut build, output) = signed_candidate(tmp.path());
    let roots = build.trust.clone();
    build.commit = "3".repeat(40);
    save_build(&output, &build);
    assert_eq!(
        verify_signed_with_roots(&output, &roots).unwrap_err(),
        "E_RELEASE_SOURCE_IDENTITY"
    );
}
#[test]
fn artifact_roots_cannot_replace_external_trust() {
    let tmp = tempfile::tempdir().unwrap();
    let (build, output) = signed_candidate(tmp.path());
    let other = PublicRoots {
        schema: 1,
        keys: vec!["ab".repeat(32)],
    };
    assert_eq!(
        verify_signed_with_roots(&output, &other).unwrap_err(),
        "E_RELEASE_TRUST_MISMATCH"
    );
    verify_signed_with_roots(&output, &build.trust).unwrap();
}
#[test]
fn wrong_manifest_signature_version_and_platform_fail_verification() {
    for case in 0..3 {
        let tmp = tempfile::tempdir().unwrap();
        let (build, output) = signed_candidate(tmp.path());
        let path = output.join("manifest.json");
        let mut envelope: SignedManifest = json(&path).unwrap();
        if case == 0 {
            envelope.signature = "00".repeat(64)
        } else {
            let mut manifest: Manifest = serde_json::from_str(&envelope.payload).unwrap();
            if case == 1 {
                manifest.version = "0.9.0".into()
            } else {
                manifest.target = "wrong".into()
            };
            envelope = serde_json::from_slice(&super::super::fixture_envelope(&manifest)).unwrap()
        };
        fs::write(path, encode(&envelope).unwrap()).unwrap();
        assert!(verify_signed_with_roots(&output, &build.trust).is_err());
    }
}
#[test]
fn empty_production_trust_and_invalid_sequence_or_issuance_fail_before_signed_output() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    let mut build = source(&input);
    build.trust.keys.clear();
    save_build(&input, &build);
    let prepared = tmp.path().join("prepared");
    prepare(&input, &prepared).unwrap();
    let now = super::super::store::now();
    let output = tmp.path().join("signed");
    assert!(sign_fixture(&prepared, &output, 1, now).is_err());
    assert!(!output.exists());
    let valid_source = tmp.path().join("valid-input");
    source(&valid_source);
    let valid = tmp.path().join("valid-prepared");
    prepare(&valid_source, &valid).unwrap();
    for (seq, issued, expected) in [
        (0, now, "E_APP_UPDATE_BUNDLE_IDENTITY"),
        (1, now + 3600, "E_APP_UPDATE_BUNDLE_IDENTITY"),
    ] {
        assert_eq!(
            sign_fixture(&valid, &output, seq, issued).unwrap_err(),
            expected
        );
        assert!(!output.exists());
    }
}
#[test]
fn public_import_rejects_known_fixture_and_preserves_existing_roots() {
    let tmp = tempfile::tempdir().unwrap();
    let roots = tmp.path().join("roots.json");
    let public = tmp.path().join("key.hex");
    let output = tmp.path().join("new.json");
    fs::write(
        &roots,
        encode(&PublicRoots {
            schema: 1,
            keys: vec!["12".repeat(32)],
        })
        .unwrap(),
    )
    .unwrap();
    fs::write(&public, FIXTURE_PUBLIC).unwrap();
    assert!(import_public(&roots, &public, &output).is_err());
    fs::write(&public, "34".repeat(32)).unwrap();
    import_public(&roots, &public, &output).unwrap();
    let new: PublicRoots = json(&output).unwrap();
    assert_eq!(new.keys, vec!["12".repeat(32), "34".repeat(32)]);
    assert_eq!(json::<PublicRoots>(&roots).unwrap().keys.len(), 1);
    assert!(import_public(&roots, &public, &output).is_err());
}

// An ephemeral test key stays in memory and is never a production trust root.
fn release_source(root: &Path) -> (Build, Ed25519KeyPair) {
    let mut build = source(root);
    let document = Ed25519KeyPair::generate_pkcs8(&ring::rand::SystemRandom::new()).unwrap();
    let key = Ed25519KeyPair::from_pkcs8(document.as_ref()).unwrap();
    build.trust.keys = vec![
        key.public_key()
            .as_ref()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    ];
    build.dirty = false;
    save_build(root, &build);
    (build, key)
}

#[test]
fn source_integrity_and_material_failures_still_prevent_signed_output() {
    for case in 0..5 {
        let tmp = tempfile::tempdir().unwrap();
        let input = tmp.path().join("input");
        let (mut build, key) = release_source(&input);
        match case {
            0 => build.dirty = true,
            1 => build.commit = "0".repeat(40),
            2 => build.tree = "0".repeat(40),
            3 => build.trust.keys.clear(),
            _ => {
                let path = input.join("licenses/license-inputs.json");
                let mut inventory: serde_json::Value = json(&path).unwrap();
                inventory["materials"][0]["sha256"] = "00".repeat(32).into();
                let bytes = encode(&inventory).unwrap();
                fs::write(path, &bytes).unwrap();
                build.notices[2] = FileRecord::of("licenses/license-inputs.json", &bytes);
            }
        }
        save_build(&input, &build);
        let prepared = tmp.path().join("prepared");
        let output = tmp.path().join("signed");
        if case == 4 {
            assert!(prepare(&input, &prepared).is_err());
            assert!(!prepared.exists());
        } else {
            prepare(&input, &prepared).unwrap();
            assert!(sign_with_key(&prepared, &output, &key, 1, super::super::store::now()).is_err());
        }
        assert!(!output.exists(), "case {case}");
    }
}

#[test]
fn own_and_third_party_license_texts_are_required() {
    for path in ["LICENSE", "licenses/THIRD_PARTY_NOTICES.md"] {
        let tmp = tempfile::tempdir().unwrap();
        let input = tmp.path().join("input");
        let mut build = source(&input);
        build.notices.retain(|notice| notice.path != path);
        save_build(&input, &build);
        assert!(prepare(&input, &tmp.path().join("prepared")).is_err());
    }
}

#[test]
fn signer_must_match_the_trusted_root_before_output() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    release_source(&input);
    let prepared = tmp.path().join("prepared");
    let output = tmp.path().join("signed");
    prepare(&input, &prepared).unwrap();
    let now = super::super::store::now();
    assert!(sign_fixture(&prepared, &output, 1, now).is_err());
    assert!(!output.exists());
}

#[test]
fn complete_portable_is_the_single_signed_update_and_detects_tampering() {
    let tmp = tempfile::tempdir().unwrap();
    let (build, output) = signed_candidate(tmp.path());
    verify_signed_with_roots(&output, &build.trust).unwrap();
    assert!(!output.join(format!("Ameow-{}-windows-x64.zip", build.version)).exists());
    let portable = output.join(portable_name(&build));
    let bytes = read(&portable, MAX_PACKAGE).unwrap();
    let (_, manifest) = build.trust.trust().unwrap().verify(&read(&output.join("manifest.json"), 16384).unwrap(), None).unwrap();
    assert_eq!(manifest.package_sha256, hash(&bytes));
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    assert!(zip.by_name("Ameow.exe").is_ok());
    assert!(zip.by_name("README.txt").is_err());
    for name in ["ameow-cli.exe", "ameow-browser-host.exe", "browser-extension/manifest.json"] {
        assert!(zip.by_name(&format!("versions/{}/{}", build.version, name)).is_ok());
    }
    drop(zip);
    let mut corrupt = fs::read(&portable).unwrap();
    corrupt[10] ^= 1;
    fs::write(&portable, corrupt).unwrap();
    assert!(verify_signed_with_roots(&output, &build.trust).is_err());
}

#[test]
fn fixture_launcher_requires_the_signed_stable_entry() {
    let tmp = tempfile::tempdir().unwrap();
    let tmp = tmp.path().canonicalize().unwrap();
    let (build, output) = signed_candidate(&tmp);
    let installed = tmp.join("installed");
    fs::create_dir(&installed).unwrap();
    zip::ZipArchive::new(File::open(output.join(portable_name(&build))).unwrap()).unwrap().extract(&installed).unwrap();
    let entry = installed.join("Ameow.exe");
    verify_fixture_launcher(&entry).unwrap();
    fs::write(&entry, b"substituted").unwrap();
    assert!(verify_fixture_launcher(&entry).is_err());
}

#[test]
fn missing_or_modified_extension_is_rejected_before_preparation() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    let build = source(&input);
    let asset = input.join("browser-extension/background.js");
    fs::write(&asset, b"substituted").unwrap();
    assert!(prepare(&input, &tmp.path().join("modified")).is_err());
    let mut incomplete = build;
    incomplete.browser.retain(|item| item.path != "browser-extension/background.js");
    save_build(&input, &incomplete);
    assert_eq!(incomplete.validate().unwrap_err(), "E_RELEASE_BROWSER_ASSETS");
}
