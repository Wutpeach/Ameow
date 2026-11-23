use super::*;
use std::{fs::FileTimes, sync::atomic::{AtomicUsize, Ordering}};

fn fixture(root: &Path, complete: bool) -> (RuntimeManager, TrustedRuntimeRequirements, PathBuf) {
    let bytes = b"#!/bin/sh\nprintf '%s' 'fixture-ready'\n".to_vec();
    let digest = hash(bytes.as_slice()).unwrap();
    let manifest = Manifest {
        schema: 1, platform: "macos-arm64".into(),
        components: vec![Component {
            name: "ffprobe".into(), version: "fixture-ready".into(),
            url: "https://invalid.example/not-used".into(), bytes: bytes.len() as u64,
            sha256: digest.clone(), license: "fixture".into(), source: "fixture".into(),
            files: vec![RuntimeFile {
                archive_path: None, name: "ffprobe".into(), sha256: digest,
                probe: "fixture".into(), version_contains: "fixture-ready".into(),
            }],
        }],
    };
    let content = serde_json::to_vec(&manifest).unwrap();
    let target = root.join(format!("runtime-{}", hash(content.as_slice()).unwrap()));
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("ffprobe"), bytes).unwrap();
    fs::set_permissions(target.join("ffprobe"), fs::Permissions::from_mode(0o755)).unwrap();
    if complete { fs::write(target.join("complete.json"), content).unwrap(); }
    let manager = RuntimeManager::new(root.into());
    *manager.test_catalog.lock().unwrap() = Some(manifest);
    *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| panic!("must reuse trusted local input")));
    (manager, TrustedRuntimeRequirements::compiled(&[("ffprobe", &["fixture-ready"])], &[]), target)
}

fn prepare(manager: &RuntimeManager, requirements: &TrustedRuntimeRequirements) -> Arc<RuntimeLease> {
    manager.prepare(requirements, &Control::default(), Arc::new(|event| {
        assert!(!matches!(event, ProcessObservation::Running { .. }), "healthy cache must not query versions");
    }), |_| {}).unwrap()
}

#[test]
fn healthy_restart_authenticates_once_and_live_lease_does_not_hash_or_probe() {
    let root = tempfile::tempdir().unwrap();
    let (manager, requirements, _) = fixture(root.path(), true);
    FILE_HASHES.with(|count| count.set(0));
    let lease = prepare(&manager, &requirements);
    assert_eq!(FILE_HASHES.with(|count| count.get()), 2);
    let live = prepare(&manager, &requirements);
    assert!(Arc::ptr_eq(&lease, &live));
    for _ in 0..3 {
        lease.file("ffprobe.exe").unwrap();
        lease.execution_guards().unwrap();
    }
    assert_eq!(FILE_HASHES.with(|count| count.get()), 2);
    drop(live);
    drop(lease);
    let restarted = prepare(&manager, &requirements);
    assert_eq!(FILE_HASHES.with(|count| count.get()), 4);
    assert!(restarted.file("undeclared").is_err());
}

#[test]
fn changed_bytes_with_original_length_and_mtime_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let (manager, requirements, target) = fixture(root.path(), true);
    let lease = prepare(&manager, &requirements);
    let path = target.join("ffprobe");
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    let mut bytes = fs::read(&path).unwrap();
    bytes[0] ^= 1;
    fs::write(&path, &bytes).unwrap();
    File::options().write(true).open(&path).unwrap()
        .set_times(FileTimes::new().set_modified(modified)).unwrap();
    assert_eq!(fs::metadata(&path).unwrap().len(), bytes.len() as u64);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    assert!(lease.file("ffprobe").is_err());
    assert!(lease.execution_guards().is_err());
    assert!(manager.prepare(&requirements, &Control::default(), Arc::new(|_| {}), |_| {}).is_err());
}

#[test]
fn identical_bytes_at_replaced_path_are_rejected_and_guards_release_after_last_owner() {
    let root = tempfile::tempdir().unwrap();
    let (manager, requirements, target) = fixture(root.path(), true);
    let lease = prepare(&manager, &requirements);
    let held = lease.execution_guards().unwrap();
    let path = target.join("ffprobe");
    let original = target.join("old-ffprobe");
    fs::rename(&path, &original).unwrap();
    fs::copy(&original, &path).unwrap();
    assert!(lease.file("ffprobe").is_err());
    let competing = File::open(&original).unwrap();
    drop(lease);
    assert_ne!(unsafe { libc::flock(competing.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) }, 0);
    drop(held);
    assert_eq!(unsafe { libc::flock(competing.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) }, 0);
}

#[test]
fn incomplete_recovery_still_probes_and_releases_its_process() {
    let root = tempfile::tempdir().unwrap();
    let (manager, requirements, original) = fixture(root.path(), false);
    let started = Arc::new(AtomicUsize::new(0));
    let settled = Arc::new(AtomicUsize::new(0));
    let counts = (started.clone(), settled.clone());
    let lease = manager.prepare(&requirements, &Control::default(), Arc::new(move |event| match event {
        ProcessObservation::Running { .. } => { counts.0.fetch_add(1, Ordering::SeqCst); }
        ProcessObservation::Settled(facts) => {
            assert!(facts.resources_releasable());
            counts.1.fetch_add(1, Ordering::SeqCst);
        }
        _ => {}
    }), |_| {}).unwrap();
    assert_eq!(started.load(Ordering::SeqCst), 1);
    assert_eq!(settled.load(Ordering::SeqCst), 1);
    assert_ne!(lease.directory, original);
    assert!(lease.directory.join("complete.json").is_file());
    assert!(!original.join("complete.json").exists());
}

#[test]
fn cancellation_during_cache_observation_does_not_return_ready() {
    let root = tempfile::tempdir().unwrap();
    let (manager, requirements, _) = fixture(root.path(), true);
    let lease = prepare(&manager, &requirements);
    let control = Control::default();
    let failure = manager.prepare_observed(&requirements, &control, Arc::new(|_| {}), |_| control.cancel()).err().unwrap();
    assert_eq!(failure.category, super::super::preparation::ErrorCategory::Cancelled);
    assert!(lease.file("ffprobe").is_ok());
}

#[test]
fn restart_rejects_corrupt_bytes_despite_an_unchanged_complete_marker() {
    let root = tempfile::tempdir().unwrap();
    let (manager, requirements, target) = fixture(root.path(), true);
    drop(prepare(&manager, &requirements));
    let path = target.join("ffprobe");
    let mut bytes = fs::read(&path).unwrap();
    bytes[0] ^= 1;
    fs::write(&path, &bytes).unwrap();
    *manager.test_acquirer.lock().unwrap() = Some(Arc::new(|_, _| Err(super::super::preparation::ErrorCategory::Connect.into())));
    assert!(manager.prepare(&requirements, &Control::default(), Arc::new(|event| {
        assert!(!matches!(event, ProcessObservation::Running { .. }));
    }), |_| {}).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert!(target.join("complete.json").is_file());
}
