use super::*;
use std::os::unix::fs::symlink;

#[test]
fn probe_snapshot_preserves_single_link_and_uses_guarded_bytes() {
    let workspace = tempfile::tempdir().unwrap();
    let source = workspace.path().join("media.mkv");
    fs::write(&source, b"verified bytes").unwrap();
    let media = verify_data(&source, workspace.path()).unwrap();
    let first = tempfile::tempdir_in(workspace.path()).unwrap();
    let first_path = probe_input(&media, first.path()).unwrap();
    assert_eq!(fs::metadata(&source).unwrap().nlink(), 1);
    assert_eq!(fs::metadata(&first_path).unwrap().nlink(), 1);
    assert_eq!(hash(fs::File::open(&first_path).unwrap()).unwrap(), media.sha256);
    fs::rename(&source, workspace.path().join("original")).unwrap();
    fs::write(&source, b"substituted bytes").unwrap();
    let second = tempfile::tempdir_in(workspace.path()).unwrap();
    let second_path = probe_input(&media, second.path()).unwrap();
    assert_eq!(fs::read(second_path).unwrap(), b"verified bytes");
    assert_eq!(fs::read(first_path).unwrap(), b"verified bytes");
}

fn filled_stage(destination: &Path) -> (tempfile::TempDir, DestinationStage) {
    let workspace = tempfile::tempdir().unwrap();
    let source = workspace.path().join("source.mp4");
    fs::write(&source, b"verified media").unwrap();
    let media = verify_data(&source, workspace.path()).unwrap();
    let mut stage = DestinationStage::create(&media, destination, 1).unwrap();
    stage.fill(&media).unwrap();
    (workspace, stage)
}

fn unsupported_clone(_: &File, _: &File, _: &CStr) -> std::io::Result<()> {
    Err(std::io::Error::from_raw_os_error(libc::ENOTSUP))
}

#[test]
fn verified_media_publishes_without_replacing_an_existing_file() {
    let workspace = tempfile::tempdir().unwrap();
    let destination = tempfile::tempdir().unwrap();
    let source = workspace.path().join("source.mp4");
    fs::write(&source, b"verified media").unwrap();
    fs::write(destination.path().join("clip.mp4"), b"existing").unwrap();
    let media = verify_data(&source, workspace.path()).unwrap();
    let mut stage = DestinationStage::create(&media, destination.path(), 1).unwrap();
    stage.fill(&media).unwrap();
    let delivered = stage.publish(destination.path(), "clip").unwrap();
    assert_eq!(delivered.file_name().unwrap(), "clip (1).mp4");
    assert_eq!(fs::read(&delivered).unwrap(), b"verified media");
    assert_eq!(
        fs::read(destination.path().join("clip.mp4")).unwrap(),
        b"existing"
    );
    stage.cleanup().unwrap();
}

#[test]
fn changed_source_cannot_be_published() {
    let workspace = tempfile::tempdir().unwrap();
    let destination = tempfile::tempdir().unwrap();
    let source = workspace.path().join("source.mp4");
    fs::write(&source, b"verified media").unwrap();
    let media = verify_data(&source, workspace.path()).unwrap();
    fs::write(&source, b"changed media!").unwrap();
    let mut stage = DestinationStage::create(&media, destination.path(), 1).unwrap();
    assert!(stage.fill(&media).is_err());
    assert!(stage.publish(destination.path(), "clip").is_err());
    stage.cleanup().unwrap();
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 0);
}

#[test]
fn verification_rejects_links_and_cleanup_retains_unverified_files() {
    let workspace = tempfile::tempdir().unwrap();
    let source = workspace.path().join("source.mp4");
    let link = workspace.path().join("link.mp4");
    fs::write(&source, b"verified media").unwrap();
    symlink(&source, &link).unwrap();
    assert!(verify_data(&link, workspace.path()).is_err());

    let media = verify_data(&source, workspace.path()).unwrap();
    let destination = tempfile::tempdir().unwrap();
    let mut stage = DestinationStage::create(&media, destination.path(), 1).unwrap();
    let unknown = destination.path().join("unknown.mp4");
    fs::write(&unknown, b"preserve").unwrap();
    stage.unverified = Some((unknown.clone(), Some(open_regular(&unknown).unwrap())));
    assert!(stage.cleanup().is_err());
    assert_eq!(fs::read(&unknown).unwrap(), b"preserve");
    fs::remove_file(&unknown).unwrap();
    stage.cleanup().unwrap();
}

#[test]
fn fallback_moves_the_verified_file_identity_and_removes_empty_private_staging() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let mut staged_identity = None;
    let delivered = stage
        .publish_using(
            destination.path(),
            "clip",
            unsupported_clone,
            |source, source_name, target, target_name| {
                let directory = source.metadata()?;
                assert_eq!(directory.mode() & 0o7777, 0o700);
                let file = open_at(source, source_name, libc::O_RDONLY, 0)?;
                let metadata = file.metadata()?;
                staged_identity = Some((metadata.dev(), metadata.ino()));
                rename_file(source, source_name, target, target_name)
            },
        )
        .unwrap();
    let metadata = fs::metadata(&delivered).unwrap();
    assert_eq!(staged_identity, Some((metadata.dev(), metadata.ino())));
    assert_eq!(fs::read(delivered).unwrap(), b"verified media");
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 1);
    assert!(stage.owned_path().is_none());
    stage.cleanup().unwrap();
}

#[test]
fn fallback_does_not_replace_a_symlink_created_at_the_rename_boundary() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let target = destination.path().join("preserve.txt");
    fs::write(&target, b"preserve").unwrap();
    let mut injected = false;
    let delivered = stage
        .publish_using(
            destination.path(),
            "clip",
            unsupported_clone,
            |source, source_name, directory, name| {
                if !injected {
                    symlink(&target, destination.path().join("clip.mp4"))?;
                    injected = true;
                }
                rename_file(source, source_name, directory, name)
            },
        )
        .unwrap();
    assert_eq!(delivered.file_name().unwrap(), "clip (1).mp4");
    assert!(
        fs::symlink_metadata(destination.path().join("clip.mp4"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_eq!(fs::read(&target).unwrap(), b"preserve");
    assert_eq!(fs::read(delivered).unwrap(), b"verified media");
    stage.cleanup().unwrap();
}

#[test]
fn fallback_rejects_same_content_source_substitution_by_identity() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let result = stage.publish_using(
        destination.path(),
        "clip",
        unsupported_clone,
        |source, source_name, directory, name| {
            rename_file(source, source_name, source, c"retained-original")?;
            let mut substituted = open_at(
                source,
                source_name,
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL,
                0o600,
            )?;
            substituted.write_all(b"verified media")?;
            substituted.sync_all()?;
            rename_file(source, source_name, directory, name)
        },
    );
    assert!(
        result
            .unwrap_err()
            .contains("not the verified private staged object")
    );
    assert!(stage.cleanup().is_err());
    let delivered = destination.path().join("clip.mp4");
    assert_eq!(fs::read(&delivered).unwrap(), b"verified media");
    fs::remove_file(&delivered).unwrap();
    assert!(stage.cleanup().is_err());
    assert_eq!(
        fs::read(
            stage
                .private
                .as_ref()
                .unwrap()
                .path
                .join("retained-original")
        )
        .unwrap(),
        b"verified media"
    );
}

#[test]
fn unsupported_exclusive_rename_retains_named_data_until_removal_is_proven() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    assert!(
        stage
            .publish_using(
                destination.path(),
                "clip",
                unsupported_clone,
                |_, _, _, _| { Err(std::io::Error::from_raw_os_error(libc::ENOTSUP)) }
            )
            .is_err()
    );
    let retained = stage.private.as_ref().unwrap().path.join("media");
    assert_eq!(fs::read(&retained).unwrap(), b"verified media");
    assert!(stage.owned_path().is_some());
    assert!(stage.cleanup().is_err());
    assert_eq!(fs::read(&retained).unwrap(), b"verified media");
    fs::remove_file(retained).unwrap();
    stage.cleanup().unwrap();
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 0);
}

#[test]
fn fallback_cleanup_never_deletes_a_substituted_private_file() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let (bytes, digest) = stage.expected.clone().unwrap();
    stage
        .prepare_private(destination.path(), bytes, &digest)
        .unwrap();
    let private = stage.private.as_ref().unwrap().path.clone();
    fs::rename(private.join("media"), private.join("retained-original")).unwrap();
    fs::write(private.join("media"), b"foreign content").unwrap();
    assert!(
        stage
            .publish_using(destination.path(), "clip", unsupported_clone, rename_file)
            .is_err()
    );
    assert!(stage.cleanup().is_err());
    assert_eq!(fs::read(private.join("media")).unwrap(), b"foreign content");
    assert_eq!(
        fs::read(private.join("retained-original")).unwrap(),
        b"verified media"
    );
}

#[test]
fn fallback_refuses_a_staging_directory_that_loses_private_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let (bytes, digest) = stage.expected.clone().unwrap();
    stage
        .prepare_private(destination.path(), bytes, &digest)
        .unwrap();
    let private = stage.private.as_ref().unwrap().path.clone();
    fs::set_permissions(&private, fs::Permissions::from_mode(0o755)).unwrap();
    let error = stage
        .publish_using(destination.path(), "clip", unsupported_clone, rename_file)
        .unwrap_err();
    assert!(error.contains("not owned and private"));
    assert!(!destination.path().join("clip.mp4").exists());
    assert!(stage.cleanup().is_err());
    assert_eq!(fs::read(private.join("media")).unwrap(), b"verified media");
}

#[test]
fn empty_directory_cleanup_does_not_accept_a_live_directory_as_removed() {
    let parent = tempfile::tempdir().unwrap();
    let private = parent.path().join("owned");
    fs::create_dir(&private).unwrap();
    let directory = File::open(&private).unwrap();
    assert!(confirm_directory_unlinked(&directory).is_err());
    assert!(private.join(".ameow-removal-proof").is_dir());
    fs::remove_dir(private.join(".ameow-removal-proof")).unwrap();
    fs::remove_dir(&private).unwrap();
    confirm_directory_unlinked(&directory).unwrap();
}

#[test]
fn replaced_destination_path_does_not_redirect_publication_or_prove_cleanup() {
    let root = tempfile::tempdir().unwrap();
    let destination = root.path().join("destination");
    let retained = root.path().join("retained-directory");
    fs::create_dir(&destination).unwrap();
    let (_workspace, mut stage) = filled_stage(&destination);
    let result = stage.publish_using(
        &destination,
        "clip",
        |_, _, _| {
            fs::rename(&destination, &retained)?;
            fs::create_dir(&destination)?;
            fs::write(destination.join("foreign.txt"), b"preserve")?;
            Err(std::io::Error::from_raw_os_error(libc::ENOTSUP))
        },
        rename_file,
    );
    assert!(result.is_err());
    assert_eq!(
        fs::read(retained.join("clip.mp4")).unwrap(),
        b"verified media"
    );
    assert!(!destination.join("clip.mp4").exists());
    assert!(stage.cleanup().is_err());
    assert_eq!(
        fs::read(destination.join("foreign.txt")).unwrap(),
        b"preserve"
    );
}

#[test]
fn fallback_retains_a_private_directory_that_was_renamed_and_replaced() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let (bytes, digest) = stage.expected.clone().unwrap();
    stage
        .prepare_private(destination.path(), bytes, &digest)
        .unwrap();
    let original_path = stage.private.as_ref().unwrap().path.clone();
    let moved = destination.path().join("moved-private-directory");
    fs::rename(&original_path, &moved).unwrap();
    fs::create_dir(&original_path).unwrap();
    fs::write(original_path.join("foreign.txt"), b"preserve").unwrap();
    fs::remove_file(moved.join("media")).unwrap();
    assert!(stage.cleanup().is_err());
    assert_eq!(
        fs::read(original_path.join("foreign.txt")).unwrap(),
        b"preserve"
    );
    assert!(moved.is_dir());
    fs::remove_dir(&moved).unwrap();
    assert!(stage.cleanup().is_err());
}

#[test]
fn clone_permission_errors_do_not_enable_a_broader_fallback() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    assert!(
        stage
            .publish_using(
                destination.path(),
                "clip",
                |_, _, _| Err(std::io::Error::from_raw_os_error(libc::EACCES)),
                rename_file
            )
            .is_err()
    );
    assert!(stage.private.is_none());
    stage.cleanup().unwrap();
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 0);
}

#[test]
fn clone_timeout_does_not_establish_absence_or_release_ownership() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    assert!(
        stage
            .publish_using(
                destination.path(),
                "clip",
                |_, _, _| Err(std::io::Error::from_raw_os_error(libc::ETIMEDOUT)),
                rename_file
            )
            .is_err()
    );
    assert!(stage.owned_path().is_some());
    assert!(stage.cleanup().is_err());
    assert!(stage.file.is_some());
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 0);
}

#[test]
fn rename_timeout_keeps_both_the_named_stage_and_uncertain_publication() {
    let destination = tempfile::tempdir().unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    assert!(
        stage
            .publish_using(
                destination.path(),
                "clip",
                unsupported_clone,
                |_, _, _, _| Err(std::io::Error::from_raw_os_error(libc::ETIMEDOUT))
            )
            .is_err()
    );
    assert!(stage.unverified.is_some());
    assert!(stage.private.as_ref().unwrap().uncertain);
    assert!(stage.cleanup().is_err());
    assert_eq!(
        fs::read(stage.private.as_ref().unwrap().path.join("media")).unwrap(),
        b"verified media"
    );
}

#[test]
#[ignore = "requires AMEOW_MACOS_OUTPUT_TEST_ROOT on a task-owned non-cloning filesystem"]
fn native_non_cloning_volume_publishes_without_replacing_existing_content() {
    let root =
        std::env::var_os("AMEOW_MACOS_OUTPUT_TEST_ROOT").expect("explicit test root required");
    let destination = tempfile::Builder::new()
        .prefix("ameow-output-test-")
        .tempdir_in(root)
        .unwrap();
    let (_workspace, mut stage) = filled_stage(destination.path());
    let clone_error = clone_file(
        stage.file.as_ref().unwrap(),
        &stage.directory,
        c"clone-capability-probe",
    )
    .unwrap_err();
    assert!(clone_unavailable(&clone_error));
    eprintln!(
        "{}",
        serde_json::json!({"event":"native-non-cloning-volume", "destination":destination.path(), "clone_errno":clone_error.raw_os_error()})
    );
    fs::write(destination.path().join("clip.mp4"), b"preserve").unwrap();
    let delivered = stage.publish(destination.path(), "clip").unwrap();
    assert_eq!(delivered.file_name().unwrap(), "clip (1).mp4");
    assert_eq!(fs::read(delivered).unwrap(), b"verified media");
    assert_eq!(
        fs::read(destination.path().join("clip.mp4")).unwrap(),
        b"preserve"
    );
    stage.cleanup().unwrap();
    assert_eq!(fs::read_dir(destination.path()).unwrap().count(), 2);
}
