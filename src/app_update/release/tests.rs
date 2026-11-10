use super::*;
use std::io::Cursor;

fn source(root: &Path) -> Build {
    fs::create_dir(root).unwrap();
    fs::create_dir(root.join("licenses")).unwrap();
    let app = b"controlled application bytes";
    let launcher = b"controlled launcher bytes";
    let license = b"unit fixture notice, not a distribution review";
    let inventory = b"{\"publicGateB\":{\"status\":\"blocked\"}}";
    for (name, bytes) in [
        ("Ameow.exe", app.as_slice()),
        ("AmeowLauncher.exe", launcher.as_slice()),
        ("LICENSE", license.as_slice()),
        ("licenses/license-inputs.json", inventory.as_slice()),
    ] {
        fs::write(root.join(name), bytes).unwrap();
    }
    let build = Build {
        schema: 1,
        version: "0.1.0".into(),
        target: TARGET.into(),
        commit: "1".repeat(40),
        tree: "2".repeat(40),
        tag: None,
        dirty: true,
        source_sha256: hash(b"unit source"),
        cargo_lock_sha256: hash(b"unit lock"),
        toolchain: "1.93.0".into(),
        public_gate_b: "blocked".into(),
        license_review: "not-evaluated".into(),
        trust: PublicRoots {
            schema: 1,
            keys: vec![FIXTURE_PUBLIC.into()],
        },
        app: FileRecord::of("Ameow.exe", app),
        launcher: FileRecord::of("AmeowLauncher.exe", launcher),
        notices: vec![
            FileRecord::of("LICENSE", license),
            FileRecord::of("licenses/license-inputs.json", inventory),
        ],
    };
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
fn separate_archives_and_unconfirmed_first_boot_verify_with_launcher_trust() {
    for days in [8, 30, 365 * 5] {
    let tmp = tempfile::tempdir().unwrap();
    let (build, output) = signed_candidate_issued(tmp.path(), super::super::store::now() - days * 86400);
    verify_signed_with_roots(&output, &build.trust).unwrap();
    let update = read(&output.join(update_name(&build.version)), MAX_PACKAGE).unwrap();
    assert_eq!(
        members(&update, &BTreeSet::from(["Ameow.exe".into()]))
            .unwrap()
            .len(),
        1
    );
    let portable = read(&output.join(portable_name(&build)), MAX_PACKAGE).unwrap();
    assert!(
        verify_update(
            &portable,
            &build,
            &FileRecord::of(&update_name(&build.version), &portable)
        )
        .is_err()
    );
    let install_root = tmp.path().join("install");
    fs::create_dir(&install_root).unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(portable)).unwrap();
    for i in 0..zip.len() {
        let mut member = zip.by_index(i).unwrap();
        let path = install_root.join(member.name());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut file = File::create(path).unwrap();
        std::io::copy(&mut member, &mut file).unwrap();
    }
    let install = super::super::Install::fixture(install_root).unwrap();
    let state = install.state().unwrap();
    assert!(state.current.is_none() && state.previous.is_none() && state.trial.is_none());
    let pending = state.pending.unwrap();
    assert_eq!(pending.version, "0.1.0");
    install.verify_release(&pending).unwrap();
    }
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
            _ => candidate.public_gate_b = "passed".into(),
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
fn extra_update_member_and_truncated_update_are_rejected() {
    let tmp = tempfile::tempdir().unwrap();
    let (build, prepared) = prepared(tmp.path());
    let plan: Plan = json(&prepared.join("unsigned-plan.json")).unwrap();
    let extra = archive(&BTreeMap::from([
        ("Ameow.exe".into(), b"controlled application bytes".to_vec()),
        ("AmeowLauncher.exe".into(), vec![1]),
    ]))
    .unwrap();
    assert!(verify_update(&extra, &build, &FileRecord::of(&plan.update.path, &extra)).is_err());
    let mut bytes = read(&prepared.join(&plan.update.path), MAX_PACKAGE).unwrap();
    bytes.truncate(bytes.len() / 2);
    assert!(verify_update(&bytes, &build, &plan.update).is_err());
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
fn portable_bootstrap_may_not_skip_ready_trial() {
    let tmp = tempfile::tempdir().unwrap();
    let (build, output) = signed_candidate(tmp.path());
    let path = output.join(portable_name(&build));
    let bytes = read(&path, MAX_PACKAGE).unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut contents = BTreeMap::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).unwrap();
        let mut body = Vec::new();
        entry.read_to_end(&mut body).unwrap();
        contents.insert(entry.name().to_string(), body);
    }
    let mut state: State = serde_json::from_slice(&contents["state.json"]).unwrap();
    state.current = state.pending.take();
    contents.insert("state.json".into(), encode(&state).unwrap());
    fs::write(path, archive(&contents).unwrap()).unwrap();
    assert_eq!(
        verify_signed_with_roots(&output, &build.trust).unwrap_err(),
        "E_RELEASE_BOOTSTRAP"
    );
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
        (0, now, "E_APP_UPDATE_SIZE"),
        (1, now + 3600, "E_APP_UPDATE_ISSUED_IN_FUTURE"),
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
fn public_source(root: &Path) -> (Build, Ed25519KeyPair) {
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
    build.public_gate_b = "approved".into();
    build.license_review = "approved".into();
    build.dirty = false;
    build.tag = Some(format!("v{}", build.version));
    let inventory = serde_json::json!({"schema":1,"scope":"public-release","publicGateB":{"status":"approved","blockers":[]},
        "materials":[{"destination":"LICENSE","sha256":build.notices[0].sha256}]});
    let bytes = encode(&inventory).unwrap();
    fs::write(root.join("licenses/license-inputs.json"), &bytes).unwrap();
    build.notices[1] = FileRecord::of("licenses/license-inputs.json", &bytes);
    save_build(root, &build);
    (build, key)
}

#[test]
fn approved_public_archives_keep_signed_core_notices_and_pending_bootstrap() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    let (build, key) = public_source(&input);
    let prepared = tmp.path().join("prepared");
    let output = tmp.path().join("signed");
    prepare(&input, &prepared).unwrap();
    let now = super::super::store::now();
    sign_with_key(&prepared, &output, &key, 1, now).unwrap();
    verify_signed_with_roots(&output, &build.trust).unwrap();
    let update = read(&output.join(update_name(&build.version)), MAX_PACKAGE).unwrap();
    verify_update(
        &update,
        &build,
        &FileRecord::of(&update_name(&build.version), &update),
    )
    .unwrap();
    let bytes = read(&output.join(portable_name(&build)), MAX_PACKAGE).unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    assert!(zip.by_name("CONTROLLED.txt").is_err());
    assert!(zip.by_name("AmeowLauncher.exe").is_ok());
    assert!(zip.by_name("LICENSE").is_ok());
    let mut state = Vec::new();
    zip.by_name("state.json")
        .unwrap()
        .read_to_end(&mut state)
        .unwrap();
    let state: State = serde_json::from_slice(&state).unwrap();
    assert!(state.current.is_none() && state.pending.is_some() && state.trial.is_none());
    assert!(!output.join("CONTROLLED.txt").exists());
}

#[test]
fn public_release_rejects_unreviewed_materials_and_unapproved_identity_before_output() {
    for case in 0..8 {
        let tmp = tempfile::tempdir().unwrap();
        let input = tmp.path().join("input");
        let (mut build, _) = public_source(&input);
        match case {
            0 => build.dirty = true,
            1 => build.tag = None,
            2 => build.trust.keys.clear(),
            3 => build.trust.keys = vec![FIXTURE_PUBLIC.into()],
            4 => build.license_review = "not-evaluated".into(),
            5 => build.commit = "0".repeat(40),
            _ => {
                let path = input.join("licenses/license-inputs.json");
                let mut inventory: serde_json::Value = json(&path).unwrap();
                if case == 6 {
                    inventory["publicGateB"]["status"] = "blocked".into();
                } else {
                    inventory["materials"][0]["sha256"] = "00".repeat(32).into();
                }
                let bytes = encode(&inventory).unwrap();
                fs::write(path, &bytes).unwrap();
                build.notices[1] = FileRecord::of("licenses/license-inputs.json", &bytes);
            }
        }
        save_build(&input, &build);
        let output = tmp.path().join("out");
        assert!(prepare(&input, &output).is_err(), "case {case}");
        assert!(!output.exists(), "case {case}");
    }
}

#[test]
fn public_signer_must_match_the_approved_root_before_output() {
    let tmp = tempfile::tempdir().unwrap();
    let input = tmp.path().join("input");
    public_source(&input);
    let prepared = tmp.path().join("prepared");
    let output = tmp.path().join("signed");
    prepare(&input, &prepared).unwrap();
    let now = super::super::store::now();
    assert!(sign_fixture(&prepared, &output, 1, now).is_err());
    assert!(!output.exists());
}
