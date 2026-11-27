use super::*;
use std::{fs, thread};
fn wait(mut condition:impl FnMut()->bool){
    let deadline=Instant::now()+Duration::from_secs(5);
    while !condition(){assert!(Instant::now()<deadline,"update owner did not settle");thread::sleep(Duration::from_millis(5));}
}
fn source(root:&Path,bytes:&[u8])->PathBuf{
    let source=root.join("source");fs::create_dir(&source).unwrap();
    let (_,package,envelope)=super::super::tests::fixture("9.0.1",1,&[("Ameow.exe",bytes)]);
    fs::write(source.join("manifest.json"),envelope).unwrap();fs::write(source.join("package.zip"),package).unwrap();source
}
fn owner(root:&Path,source:Option<PathBuf>)->(Handle,Install){
    let install=Install::fixture(root.join("install")).unwrap();
    let handle=Handle::start_with(root.join("ui-settings.json"),None,source,Some(install.clone()));
    (handle,install)
}
#[test]
fn tracked_actions_report_real_persistence_and_update_results() {
    let root = tempfile::tempdir().unwrap();
    let source = source(root.path(), b"tracked update");
    let (h, install) = owner(root.path(), Some(source));
    wait(|| h.preferences_known());
    let prefs = Preferences { auto_update: false, notify_updates: true };
    let id = h.send_tracked(Action::Save(prefs.clone())).unwrap();
    wait(|| h.tracked().is_some_and(|op| op.id == id && op.done));
    assert_eq!(h.tracked().unwrap().success, Some(true));
    assert_eq!(h.snapshot().preferences, prefs);
    assert_eq!(read_json::<Preferences>(&root.path().join("app-update-settings.json")).unwrap(), prefs);
    let id = h.send_tracked(Action::Check).unwrap();
    wait(|| h.tracked().is_some_and(|op| op.id == id && op.done));
    assert_eq!(h.tracked().unwrap().success, Some(true));
    assert_eq!(h.snapshot().update.phase, Phase::Available);
    let id = h.send_tracked(Action::Download).unwrap();
    wait(|| h.tracked().is_some_and(|op| op.id == id && op.done));
    assert_eq!(h.tracked().unwrap().success, Some(true));
    assert_eq!(h.snapshot().update.phase, Phase::Ready);
    assert!(install.state().unwrap().pending.is_some());
    assert!(h.send_tracked(Action::Restart).is_err(), "fixture has no launcher session");
}

#[test]
fn tracked_save_failure_does_not_claim_success() {
    let root = tempfile::tempdir().unwrap();
    let (h, _) = owner(root.path(), None);
    wait(|| h.preferences_known());
    fs::create_dir(root.path().join("app-update-settings.json")).unwrap();
    let id = h.send_tracked(Action::Save(Preferences { auto_update: false, notify_updates: false })).unwrap();
    wait(|| h.tracked().is_some_and(|op| op.id == id && op.done));
    let result = h.tracked().unwrap();
    assert_eq!(result.success, Some(false));
    assert!(result.error.is_some());
    assert_eq!(h.snapshot().preferences, Preferences::default());
}
#[test]
fn scheduler_delays_start_limits_manual_checks_and_backs_off_without_busy_retries(){
    let mut s=Schedule::default();assert!(!s.due(STARTUP_MS-1));assert!(s.due(STARTUP_MS));
    assert!(s.manual_allowed(0));s.checked(123);assert!(!s.manual_allowed(10122));assert!(s.manual_allowed(10123));
    s.finished(200,true);assert!(!s.due(120199));assert!(s.due(120200));
    s.finished(300,true);assert!(!s.due(240299));assert!(s.due(240300));
    for _ in 0..20{s.finished(400,true);}
    assert!(!s.due(400+PERIOD_MS-1));assert!(s.due(400+PERIOD_MS));
    s.finished(500,false);assert!(!s.due(500+PERIOD_MS-1));assert!(s.due(500+PERIOD_MS));
    s.finished(600,true);assert!(s.due(120600));
}
#[test]
fn first_defaults_persist_restore_and_save_failures_keep_the_effective_preferences(){
    let root=tempfile::tempdir().unwrap();let (h,_)=owner(root.path(),None);
    assert_eq!(h.snapshot().preferences,Preferences{auto_update:true,notify_updates:true});
    let prefs=Preferences{auto_update:false,notify_updates:false};
    assert!(h.send(Action::Save(prefs.clone())));wait(||h.snapshot().saved);
    assert_eq!(h.snapshot().preferences,prefs);drop(h);
    let (h,_)=owner(root.path(),None);wait(||h.snapshot().preferences==prefs);drop(h);
    fs::remove_file(root.path().join("app-update-settings.json")).unwrap();fs::create_dir(root.path().join("app-update-settings.json")).unwrap();
    let (h,_)=owner(root.path(),None);wait(||h.snapshot().save_error.is_some());
    assert!(h.send(Action::Save(prefs)));wait(||!h.snapshot().saving);
    assert!(h.snapshot().save_error.is_some());assert_eq!(h.snapshot().preferences,Preferences::default());assert!(!h.snapshot().saved);
}
#[test]
fn manual_check_and_download_work_with_automatic_updates_disabled(){
    let root=tempfile::tempdir().unwrap();let source=source(root.path(),b"verified fixture");
    let (h,install)=owner(root.path(),Some(source));
    assert!(h.send(Action::Save(Preferences{auto_update:false,..Default::default()})));wait(||h.snapshot().saved);
    assert!(h.send(Action::Check));wait(||h.snapshot().update.phase==Phase::Available);assert!(install.state().unwrap().pending.is_none());
    assert!(h.send(Action::Download));wait(||h.snapshot().update.phase==Phase::Ready);
    let pending=install.state().unwrap().pending.unwrap();assert_eq!(pending.version,"9.0.1");assert!(install.verify_release(&pending).is_ok());
    let other=h.clone();assert!(h.send(Action::Restart));assert!(other.send(Action::Restart));assert!(other.send(Action::Later));assert!(!h.shared.manual_restart.load(Ordering::Acquire));
}
#[test]
fn old_signed_latest_is_available_and_prepares_after_years_without_resigning(){
    for days in [8,30,365*5] {
        let root=tempfile::tempdir().unwrap();
        let source=root.path().join("source");fs::create_dir(&source).unwrap();
        let (_,package,envelope)=super::super::tests::fixture_issued(
            "9.0.1",1,&[("Ameow.exe",b"verified old release")],
            super::super::store::now()-days*86400);
        fs::write(source.join("manifest.json"),&envelope).unwrap();
        fs::write(source.join("package.zip"),package).unwrap();
        let(h,install)=owner(root.path(),Some(source));
        h.send(Action::Save(Preferences{auto_update:false,..Default::default()}));
        wait(||h.snapshot().saved);
        h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Available);
        assert!(install.state().unwrap().pending.is_none());
        h.send(Action::Download);wait(||h.snapshot().update.phase==Phase::Ready);
        let pending=install.state().unwrap().pending.unwrap();
        assert_eq!(pending.version,"9.0.1");install.verify_release(&pending).unwrap();
        assert!(install.root.join("versions/9.0.1/bundle.json").is_file());
    }
}
#[test]
fn reenabling_background_download_prepares_the_already_discovered_signed_version(){
    let root=tempfile::tempdir().unwrap();let source=source(root.path(),b"verified fixture");let(h,install)=owner(root.path(),Some(source));
    assert!(h.send(Action::Save(Preferences{auto_update:false,..Default::default()})));wait(||h.snapshot().saved);
    h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Available);assert!(install.state().unwrap().pending.is_none());
    h.send(Action::Save(Preferences::default()));wait(||h.snapshot().update.phase==Phase::Ready);
    assert!(install.state().unwrap().pending.is_some());
}
#[test]
fn disabling_automatic_download_cancels_inflight_work_and_does_not_publish_pending(){
    let root=tempfile::tempdir().unwrap();
    let mut data=vec![0;8_000_000];let mut n=123u64;for byte in &mut data{n^=n<<13;n^=n>>7;n^=n<<17;*byte=n as u8;}
    let source=source(root.path(),&data);let(h,install)=owner(root.path(),Some(source));
    h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Downloading&&h.snapshot().update.downloaded>0);
    h.send(Action::Save(Preferences{auto_update:false,..Default::default()}));wait(||h.snapshot().saved);
    assert_eq!(h.snapshot().update.phase,Phase::Available);assert!(install.state().unwrap().pending.is_none());
    assert_eq!(fs::read_dir(install.root.join("staging")).unwrap().count(),0);
}
#[test]
fn disabling_during_verification_cannot_publish_a_ready_update(){
    let root=tempfile::tempdir().unwrap();let install=Install::fixture(root.path().join("install")).unwrap();let source=source(root.path(),b"fixture");
    let envelope=fs::read(source.join("manifest.json")).unwrap();let cancel=AtomicBool::new(false);let gate=Mutex::new(());
    let result=install.prepare_observed(&envelope,&cancel,|phase,_,_,_|{if phase==Phase::Verifying{let _gate=gate.lock().unwrap();cancel.store(true,Ordering::Release);}},Some(&source),&gate);
    assert_eq!(result.unwrap_err(),"E_APP_UPDATE_CANCELLED");assert!(install.state().unwrap().pending.is_none());assert!(!install.root.join("versions/9.0.1").exists());
}
#[test]
fn unconfigured_source_is_closed_before_fixture_or_network_and_source_failure_is_visible(){
    let root=tempfile::tempdir().unwrap();let unconfigured=Install::unconfigured(root.path().join("unconfigured")).unwrap();
    assert_eq!(read_source(&unconfigured,Some(root.path()),&AtomicBool::new(false)).unwrap_err(),"E_APP_UPDATE_TRUST_NOT_CONFIGURED");
    let(h,_)=owner(root.path(),Some(root.path().join("missing")));h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Failed);
    assert!(h.snapshot().update.error.unwrap().contains("E_APP_UPDATE_SOURCE"));
}
fn restart_fixture(root:&Path)->(Handle,Session,DownloadCoordinator){
    let install=Install::fixture(root.join("install")).unwrap();super::super::tests::prepare(&install,"9.0.1",1);
    let session=Session::for_test(install);
    let h=Handle::inert(View{launcher:true,..Default::default()});
    *h.shared.coordinator.lock().unwrap()=Some(session.coordinator.clone());
    let queue=DownloadCoordinator::update_test_queue(root);
    allow_automatic_restart(&h,&queue);
    (h,session,queue)
}
#[cfg(target_os = "macos")]
#[test]
fn macos_restart_failure_is_persisted_without_changing_the_release_or_queue() {
    let root = tempfile::tempdir().unwrap();
    let (handle, session, queue) = restart_fixture(&root.path().canonicalize().unwrap());
    let install = session.coordinator.install();
    let before = serde_json::to_value(install.state().unwrap()).unwrap();
    handle.restart_failed(&queue, &session, "E_APP_UPDATE_PATH_OPEN: missing supervisor".into());
    let mut after = serde_json::to_value(install.state().unwrap()).unwrap();
    assert_eq!(after["last_error"], "E_APP_UPDATE_PATH_OPEN: missing supervisor");
    after["last_error"] = before["last_error"].clone();
    assert_eq!(after, before);
    let reopened = Coordinator::new(install.clone()).snapshot();
    assert_eq!(reopened.phase, Phase::Failed);
    assert_eq!(reopened.error.as_deref(), Some("E_APP_UPDATE_PATH_OPEN: missing supervisor"));
    assert!(queue.submit("https://youtu.be/00000000001".into()).is_ok());
}
#[cfg(target_os = "macos")]
#[test]
fn macos_cancelled_authorization_preserves_existing_diagnostics_and_allows_retry() {
    let root = tempfile::tempdir().unwrap();
    let (handle, session, queue) = restart_fixture(&root.path().canonicalize().unwrap());
    let install = session.coordinator.install();
    super::super::macos_helper::record_result(install, Err("previous failure".into())).unwrap_err();
    let before = serde_json::to_value(install.state().unwrap()).unwrap();
    handle.restart_failed(&queue, &session, "E_APP_UPDATE_AUTHORIZATION_CANCELLED".into());
    assert_eq!(serde_json::to_value(install.state().unwrap()).unwrap(), before);
    let view = handle.snapshot();
    assert_eq!(view.update.phase, Phase::Ready);
    assert_eq!(view.update.error.as_deref(), Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED"));
    handle.poll(&queue, Some(&session));
    assert!(!queue.snapshot().stopping);
    assert!(!handle.shared.closing.load(Ordering::Acquire));
    assert!(handle.send(Action::Restart));
    handle.poll(&queue, Some(&session));
    assert!(handle.shared.closing.load(Ordering::Acquire));
    assert!(queue.submit("https://youtu.be/00000000001".into()).is_ok());
}
#[cfg(target_os = "macos")]
#[test]
fn macos_failed_authorization_persists_error_and_requires_manual_retry() {
    let root = tempfile::tempdir().unwrap();
    let (handle, session, queue) = restart_fixture(&root.path().canonicalize().unwrap());
    let error = "E_APP_UPDATE_AUTHORIZATION_WORKER: missing supervisor";
    handle.restart_failed(&queue, &session, error.into());
    assert_eq!(session.coordinator.install().state().unwrap().last_error.as_deref(), Some(error));
    assert_eq!(handle.snapshot().update.phase, Phase::Ready);
    assert_eq!(handle.snapshot().update.error.as_deref(), Some(error));
    handle.poll(&queue, Some(&session));
    assert!(!handle.shared.closing.load(Ordering::Acquire));
    assert!(!queue.snapshot().stopping);
    assert!(handle.send(Action::Restart));
    handle.poll(&queue, Some(&session));
    assert!(handle.shared.closing.load(Ordering::Acquire));
}
#[test]
fn manual_restart_with_tasks_schedules_one_drain_without_a_second_choice(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    h.shared.view.lock().unwrap().preferences.auto_update=false;
    q.submit("https://youtu.be/00000000001".into()).unwrap();
    q.submit("https://youtu.be/00000000002".into()).unwrap();
    assert!(h.send(Action::Restart));assert!(h.clone().send(Action::Restart));
    h.poll(&q,Some(&s));s.poll(&q).unwrap();
    assert_eq!(h.snapshot().update.phase,Phase::WaitingForTasks);assert!(q.submit("https://youtu.be/00000000003".into()).is_err());assert!(!q.snapshot().stopping);
    assert_eq!(q.snapshot().unfinished,2);assert!(!s.quit.load(Ordering::Acquire));
    assert!(h.send(Action::Restart));h.poll(&q,Some(&s));s.poll(&q).unwrap();
    assert_eq!(h.snapshot().update.phase,Phase::WaitingForTasks);assert_eq!(q.snapshot().unfinished,2);assert!(!q.snapshot().stopping);
    h.send(Action::Later);h.poll(&q,Some(&s));s.poll(&q).unwrap();
    assert_eq!(h.snapshot().update.phase,Phase::Ready);assert!(q.submit("https://youtu.be/00000000003".into()).is_ok());assert!(!s.quit.load(Ordering::Acquire));
}
#[test]
fn automatic_restart_waits_for_a_continuous_quiet_period(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    h.user_interaction();
    h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    allow_automatic_restart(&h,&q);
    h.poll(&q,Some(&s));assert!(q.snapshot().stopping);
    s.poll(&q).unwrap();assert!(!s.quit.load(Ordering::Acquire));assert!(!q.snapshot().stopped);
}
#[test]
fn automatic_restart_requires_ready_and_enabled_and_keeps_accepted_tasks_running(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    h.shared.view.lock().unwrap().preferences.auto_update=false;
    h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    h.shared.view.lock().unwrap().preferences.auto_update=true;
    s.coordinator.set_state(Phase::Downloading,Some("9.0.1".into()),None);
    h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    s.coordinator.set_state(Phase::Ready,Some("9.0.1".into()),None);
    q.submit("https://youtu.be/00000000001".into()).unwrap();
    h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    assert!(q.submit("https://youtu.be/00000000002".into()).is_ok());
}
#[test]
fn new_task_and_automatic_restart_share_atomic_admission(){
    for _ in 0..8 {
        let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
        let submitted=thread::scope(|scope|{
            let submit=scope.spawn(||q.submit("https://youtu.be/00000000001".into()));
            h.poll(&q,Some(&s));submit.join().unwrap()
        });
        if let Ok(id)=submitted {
            assert!(!q.snapshot().stopping);
            assert!(q.snapshot().jobs.iter().any(|job|job.job_id==id&&!job.phase.terminal()));
        } else {assert!(q.snapshot().stopping);}
    }
}
#[test]
fn settings_write_blocks_idle_restart_and_final_idle_barrier_does_not_fake_resource_release(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    h.shared.view.lock().unwrap().saving=true;h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    h.shared.view.lock().unwrap().saving=false;
    h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    allow_automatic_restart(&h,&q);h.poll(&q,Some(&s));assert!(q.snapshot().stopping);
    s.poll(&q).unwrap();assert!(!s.quit.load(Ordering::Acquire));assert!(!q.snapshot().stopped);
    assert!(q.submit("https://youtu.be/00000000001".into()).is_err());
}
fn allow_automatic_restart(handle:&Handle, queue:&DownloadCoordinator) {
    let before = Instant::now() - INSTALL_QUIET_PERIOD;
    *handle.shared.idle.lock().unwrap() = IdleWindow { since: Some(before), interaction: before, revision:Some(queue.snapshot().revision) };
}
#[test]
fn legacy_preferences_keep_every_explicit_disable_and_new_values_round_trip() {
    assert_eq!(serde_json::from_str::<Preferences>("{}").unwrap(), Preferences::default());
    for auto_check in [false, true] {
        for auto_download in [false, true] {
            for idle_restart in [false, true] {
                let old = serde_json::json!({"auto_check":auto_check,"auto_download":auto_download,"idle_restart":idle_restart});
                let prefs:Preferences = serde_json::from_value(old).unwrap();
                assert_eq!(prefs.auto_update, auto_check && auto_download && idle_restart);
                assert!(prefs.notify_updates);
            }
        }
    }
    for auto_update in [false, true] {
        for notify_updates in [false, true] {
            let prefs = Preferences {auto_update, notify_updates};
            let json = serde_json::to_value(&prefs).unwrap();
            assert_eq!(json.as_object().unwrap().len(), 2);
            assert_eq!(serde_json::from_value::<Preferences>(json).unwrap(), prefs);
        }
    }
    assert!(!serde_json::from_str::<Preferences>(r#"{"auto_download":false}"#).unwrap().auto_update);
    assert!(serde_json::from_str::<Preferences>(r#"{"auto_update":true,"idle_restart":false}"#).unwrap().auto_update);
    assert!(serde_json::from_str::<Preferences>(r#"{"auto_update":"yes"}"#).is_err());
    assert!(serde_json::from_str::<Preferences>(r#"{"unknown":false}"#).is_err());
}
#[test]
fn idle_window_resets_for_resources_or_interaction_and_requires_the_entire_interval() {
    let start = Instant::now();
    let mut idle = IdleWindow {since:None, interaction:start, revision:None};
    assert!(!idle.ready(start, true, 1));
    assert!(!idle.ready(start + INSTALL_QUIET_PERIOD - Duration::from_millis(1), true, 1));
    assert!(idle.ready(start + INSTALL_QUIET_PERIOD, true, 1));
    assert!(!idle.ready(start + INSTALL_QUIET_PERIOD, false, 1));
    assert!(!idle.ready(start + INSTALL_QUIET_PERIOD, true, 1));
    idle.interaction = start + INSTALL_QUIET_PERIOD + Duration::from_secs(1);
    assert!(!idle.ready(start + INSTALL_QUIET_PERIOD * 2, true, 1));
    assert!(idle.ready(start + INSTALL_QUIET_PERIOD * 2 + Duration::from_secs(1), true, 1));
    assert!(!idle.ready(start + INSTALL_QUIET_PERIOD * 2 + Duration::from_secs(1), true, 3));
    assert!(!idle.ready(start + INSTALL_QUIET_PERIOD * 3, true, 3));
    assert!(idle.ready(start + INSTALL_QUIET_PERIOD * 3 + Duration::from_secs(1), true, 3));
}
#[test]
fn short_queue_activity_between_polls_restarts_the_quiet_period() {
    let root=tempfile::tempdir().unwrap();let(handle,session,queue)=restart_fixture(root.path());
    let job=queue.submit("https://youtu.be/00000000001".into()).unwrap();
    assert!(queue.cancel(job));
    assert!(queue.app_update_idle());
    handle.poll(&queue,Some(&session));
    assert!(!queue.snapshot().stopping);
    assert!(!handle.shared.closing.load(Ordering::Acquire));
    allow_automatic_restart(&handle,&queue);
    handle.poll(&queue,Some(&session));
    assert!(queue.snapshot().stopping);
}
#[test]
fn reminders_do_not_cancel_or_start_downloads_when_automatic_updates_are_off() {
    let root=tempfile::tempdir().unwrap();
    let (handle,install)=owner(root.path(),Some(source(root.path(),b"manual fixture")));
    handle.send(Action::Save(Preferences{auto_update:false,..Default::default()}));
    wait(||handle.snapshot().saved);
    handle.send(Action::Check);wait(||handle.snapshot().update.phase==Phase::Available);
    for notify_updates in [false,true] {
        handle.send(Action::Save(Preferences{auto_update:false,notify_updates}));
        assert!(!handle.shared.cancel.load(Ordering::Acquire));
        wait(||handle.snapshot().saved);
        assert_eq!(handle.snapshot().update.phase,Phase::Available);
        assert_eq!(handle.snapshot().full_attention(),notify_updates);
        assert!(install.state().unwrap().pending.is_none());
    }
    handle.send(Action::Download);wait(||handle.snapshot().update.phase==Phase::Ready);
}
#[test]
fn all_four_combinations_keep_background_checks_and_only_auto_download_when_enabled() {
    let cases = [false,true].into_iter().flat_map(|auto_update| [false,true].map(move |notify_updates| {
        let root=tempfile::tempdir().unwrap();
        let (handle,install)=owner(root.path(),Some(source(root.path(),b"four combinations")));
        handle.send(Action::Save(Preferences{auto_update,notify_updates}));
        wait(||handle.snapshot().saved);
        (root,handle,install,auto_update,notify_updates)
    })).collect::<Vec<_>>();
    let deadline=Instant::now()+Duration::from_millis(STARTUP_MS+10_000);
    loop {
        if cases.iter().all(|(_,handle,_,automatic,_)| handle.snapshot().update.phase == if *automatic {Phase::Ready} else {Phase::Available}) {break;}
        assert!(Instant::now()<deadline,"automatic checking did not settle in all four combinations");
        thread::sleep(Duration::from_millis(10));
    }
    for (_,handle,install,automatic,notify) in &cases {
        assert_eq!(handle.snapshot().full_attention(),*notify);
        assert_eq!(install.state().unwrap().pending.is_some(),*automatic);
    }
}
#[test]
fn ready_updates_allow_real_checks_without_reacquiring_or_losing_a_valid_candidate() {
    for missing_manifest in [false,true] {
        let root=tempfile::tempdir().unwrap();let(handle,install,source)=ready_owner(root.path());
        let before=serde_json::to_value(install.state().unwrap()).unwrap();
        if missing_manifest { fs::remove_file(source.join("manifest.json")).unwrap(); }
        assert!(handle.send(Action::Check));
        wait(||handle.snapshot().check_retry_secs>0 && handle.snapshot().update.phase==Phase::Ready
            && (!missing_manifest || handle.snapshot().check_error.is_some()));
        assert_eq!(serde_json::to_value(install.state().unwrap()).unwrap(),before);
        if missing_manifest {
            assert_eq!(handle.snapshot().check_error.as_deref(),Some("E_APP_UPDATE_CHECK_FAILED"));
        } else { assert!(handle.snapshot().check_error.is_none()); }
        assert!(handle.snapshot().update.error.is_none());
        assert!(handle.send(Action::Restart));
    }
}
fn ready_owner(root:&Path)->(Handle,Install,PathBuf) {
    let source=source(root,b"ready candidate");
    let install=Install::fixture(root.join("install")).unwrap();
    let envelope=fs::read(source.join("manifest.json")).unwrap();
    install.prepare_observed(&envelope,&AtomicBool::new(false),|_,_,_,_|{},Some(&source),&Mutex::new(())).unwrap();
    let(handle,install)=owner(root,Some(source.clone()));
    wait(||handle.snapshot().update.phase==Phase::Ready);
    (handle,install,source)
}
#[test]
fn rechecking_never_removes_the_existing_manual_install_barrier() {
    for error in ["E_APP_UPDATE_AUTHORIZATION_CANCELLED","E_APP_UPDATE_AUTHORIZATION_WORKER: unavailable"] {
        for missing_manifest in [false,true] {
            let root=tempfile::tempdir().unwrap();let(handle,install,source)=ready_owner(root.path());
            handle.shared.coordinator.lock().unwrap().as_ref().unwrap()
                .set_state(Phase::Ready,Some("9.0.1".into()),Some(error.into()));
            if missing_manifest { fs::remove_file(source.join("manifest.json")).unwrap(); }
            assert!(handle.send(Action::Check));
            wait(||handle.snapshot().check_retry_secs>0 && handle.snapshot().update.phase==Phase::Ready);
            assert_eq!(handle.snapshot().update.error.as_deref(),Some(error));
            assert_eq!(handle.snapshot().check_error.is_some(),missing_manifest);
            let session=Session::for_test(install);
            let queue=DownloadCoordinator::update_test_queue(root.path());
            allow_automatic_restart(&handle,&queue);
            handle.poll(&queue,Some(&session));
            assert!(!queue.snapshot().stopping);
            assert!(!handle.shared.closing.load(Ordering::Acquire));
            assert!(handle.send(Action::Restart));
        }
    }
}
#[test]
fn rechecking_a_newer_version_retains_install_barriers_and_reports_failed_acquisition() {
    for error in [None,Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED"),Some("E_APP_UPDATE_AUTHORIZATION_WORKER: unavailable")] {
        for missing_package in [false,true] {
            let root=tempfile::tempdir().unwrap();let(handle,install,source)=ready_owner(root.path());
            handle.shared.coordinator.lock().unwrap().as_ref().unwrap()
                .set_state(Phase::Ready,Some("9.0.1".into()),error.map(str::to_owned));
            let(_,package,envelope)=super::super::tests::fixture("9.0.2",2,&[("Ameow.exe",b"newer candidate")]);
            fs::write(source.join("manifest.json"),envelope).unwrap();
            if missing_package { fs::remove_file(source.join("package.zip")).unwrap(); }
            else { fs::write(source.join("package.zip"),package).unwrap(); }
            assert!(handle.send(Action::Check));
            wait(||handle.snapshot().check_retry_secs>0 && handle.snapshot().update.phase==Phase::Ready);
            let expected=if missing_package { "9.0.1" } else { "9.0.2" };
            assert_eq!(handle.snapshot().update.version.as_deref(),Some(expected));
            assert_eq!(install.state().unwrap().pending.unwrap().version,expected);
            assert_eq!(handle.snapshot().update.error.as_deref(),error);
            assert_eq!(handle.snapshot().check_error.is_some(),missing_package);
            if error.is_some() {
                let session=Session::for_test(install);
                let queue=DownloadCoordinator::update_test_queue(root.path());
                allow_automatic_restart(&handle,&queue);
                handle.poll(&queue,Some(&session));
                assert!(!queue.snapshot().stopping);
            }
            assert!(handle.send(Action::Restart));
        }
    }
}
#[test]
fn manual_newer_checks_keep_install_barriers_through_download_or_enabling_automatic_updates() {
    for error in ["E_APP_UPDATE_AUTHORIZATION_CANCELLED","E_APP_UPDATE_AUTHORIZATION_WORKER: unavailable"] {
        for enable_automatic in [false,true] {
            let root=tempfile::tempdir().unwrap();let(handle,install,source)=ready_owner(root.path());
            assert!(handle.send(Action::Save(Preferences{auto_update:false,..Default::default()})));
            wait(||handle.snapshot().saved);
            handle.shared.coordinator.lock().unwrap().as_ref().unwrap()
                .set_state(Phase::Ready,Some("9.0.1".into()),Some(error.into()));
            let before=serde_json::to_value(install.state().unwrap()).unwrap();
            let(_,package,envelope)=super::super::tests::fixture("9.0.2",2,&[("Ameow.exe",b"deferred newer candidate")]);
            fs::write(source.join("manifest.json"),envelope).unwrap();
            fs::write(source.join("package.zip"),package).unwrap();
            assert!(handle.send(Action::Check));
            wait(||handle.snapshot().update.phase==Phase::Available);
            assert_eq!(handle.snapshot().update.version.as_deref(),Some("9.0.2"));
            assert_eq!(handle.snapshot().update.error.as_deref(),Some(error));
            assert!(handle.snapshot().check_error.is_none());
            assert_eq!(serde_json::to_value(install.state().unwrap()).unwrap(),before);
            let pending=install.state().unwrap().pending.unwrap();
            assert_eq!(pending.version,"9.0.1");
            install.verify_release(&pending).unwrap();
            if enable_automatic {
                assert!(handle.send(Action::Save(Preferences::default())));
            } else {
                assert!(handle.send(Action::Download));
            }
            wait(||handle.snapshot().update.phase==Phase::Ready);
            assert_eq!(handle.snapshot().update.version.as_deref(),Some("9.0.2"));
            assert_eq!(handle.snapshot().update.error.as_deref(),Some(error));
            assert_eq!(handle.snapshot().preferences.auto_update,enable_automatic);
            let pending=install.state().unwrap().pending.unwrap();
            assert_eq!(pending.version,"9.0.2");
            install.verify_release(&pending).unwrap();
            let session=Session::for_test(install);
            session.coordinator.prepare_restart().unwrap();
            let queue=DownloadCoordinator::update_test_queue(root.path());
            allow_automatic_restart(&handle,&queue);
            handle.poll(&queue,Some(&session));
            assert!(!queue.snapshot().stopping);
            assert!(!handle.shared.closing.load(Ordering::Acquire));
            assert!(handle.send(Action::Restart));
            handle.poll(&queue,Some(&session));
            assert!(handle.shared.closing.load(Ordering::Acquire));
        }
    }
}
#[cfg(target_os="macos")]
#[test]
fn disabling_automatic_updates_during_a_slow_recheck_keeps_the_valid_ready_candidate() {
    use std::os::unix::ffi::OsStrExt;
    let root=tempfile::tempdir().unwrap();let(handle,install,source)=ready_owner(root.path());
    let manifest=source.join("manifest.json");fs::remove_file(&manifest).unwrap();
    let fifo=std::ffi::CString::new(manifest.as_os_str().as_bytes()).unwrap();
    assert_eq!(unsafe{libc::mkfifo(fifo.as_ptr(),0o600)},0);
    assert!(handle.send(Action::Check));
    let writer=fs::OpenOptions::new().write(true).open(manifest).unwrap();
    assert!(handle.send(Action::Save(Preferences{auto_update:false,..Default::default()})));
    drop(writer);
    wait(||handle.snapshot().saved);
    assert_eq!(handle.snapshot().update.phase,Phase::Ready);
    assert_eq!(handle.snapshot().update.version.as_deref(),Some("9.0.1"));
    assert!(install.state().unwrap().pending.is_some());
    assert_eq!(handle.snapshot().check_error.as_deref(),Some("E_APP_UPDATE_CANCELLED"));
    assert!(handle.send(Action::Restart));
}
#[test]
fn old_view_snapshots_without_check_errors_still_deserialize() {
    let mut stored=serde_json::to_value(View::default()).unwrap();
    stored.as_object_mut().unwrap().remove("check_error");
    let view:View=serde_json::from_value(stored).unwrap();
    assert!(view.check_error.is_none());
}
#[test]
fn queued_ready_check_blocks_duplicate_checks_and_restart_until_the_owner_handles_it() {
    let root=tempfile::tempdir().unwrap();let(mut handle,session,queue)=restart_fixture(root.path());
    let(sender,receiver)=mpsc::sync_channel(8);handle.sender=sender;
    assert!(handle.send(Action::Check));
    assert_eq!(handle.snapshot().update.phase,Phase::Checking);
    assert!(!handle.send(Action::Check));
    assert!(!handle.send(Action::Restart));
    handle.poll(&queue,Some(&session));
    assert!(!queue.snapshot().stopping);
    assert!(matches!(receiver.try_recv(),Ok((Action::Check,None))));
    assert!(receiver.try_recv().is_err());
}

#[test]
fn authenticated_current_or_older_legacy_feed_is_quiet_without_acquiring_a_package() {
    for version in [BUILD_VERSION, "0.5.0"] {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("source");fs::create_dir(&source).unwrap();
        let(mut m,_,_)=super::super::tests::fixture(version,1,&[("Ameow.exe",b"legacy")]);
        m.schema=1;m.bundle_sha256=None;
        m.url=format!("https://github.com/Wutpeach/Ameow/releases/download/v{version}/Ameow-{version}-windows-x64.zip");
        fs::write(source.join("manifest.json"),super::super::fixture_envelope(&m)).unwrap();
        let install=Install::fixture(root.path().join("install")).unwrap();
        let before=serde_json::to_value(install.state().unwrap()).unwrap();
        let h=Handle::start_with(root.path().join("ui-settings.json"),None,Some(source),Some(install.clone()));
        h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::NoUpdate);
        let view=h.snapshot();assert!(view.update.error.is_none() && view.check_error.is_none());assert!(!view.full_attention());
        assert_eq!(serde_json::to_value(install.state().unwrap()).unwrap(),before);
    }
}
#[test]
fn discovery_authenticates_identity_even_when_a_legacy_release_is_not_newer() {
    for (mutation,error) in [(0,"SIGNATURE"),(1,"IDENTITY"),(2,"IDENTITY"),(3,"IDENTITY"),(4,"VERSION")] {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("source");fs::create_dir(&source).unwrap();
        let(mut m,_,_)=super::super::tests::fixture(BUILD_VERSION,1,&[("Ameow.exe",b"legacy")]);m.schema=1;m.bundle_sha256=None;
        match mutation {1=>m.product="Other".into(),2=>m.channel="nightly".into(),3=>m.target=super::super::package::MACOS_ARM_TARGET.into(),4=>m.version="0.5.01".into(),_=>{}}
        let mut envelope=super::super::fixture_envelope(&m);
        if mutation==0 {let mut signed:super::super::SignedManifest=serde_json::from_slice(&envelope).unwrap();signed.payload.push(' ');envelope=serde_json::to_vec(&signed).unwrap();}
        fs::write(source.join("manifest.json"),envelope).unwrap();let(h,install)=owner(root.path(),Some(source));
        h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Failed);
        assert!(h.snapshot().update.error.as_ref().unwrap().contains(error));assert!(install.state().unwrap().pending.is_none());
    }
}
#[test]
fn newer_release_still_requires_the_complete_supported_package_contract() {
    for (schema,error) in [(1,"E_APP_UPDATE_FORMAT"),(2,"E_APP_UPDATE_BUNDLE_IDENTITY")] {
        let root=tempfile::tempdir().unwrap();let source=root.path().join("source");fs::create_dir(&source).unwrap();
        let(mut m,_,_)=super::super::tests::fixture("9.0.1",1,&[("Ameow.exe",b"candidate")]);m.schema=schema;m.bundle_sha256=None;
        fs::write(source.join("manifest.json"),super::super::fixture_envelope(&m)).unwrap();let(h,install)=owner(root.path(),Some(source));
        h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Failed);
        assert_eq!(h.snapshot().update.error.as_deref(),Some(error));assert!(install.state().unwrap().pending.is_none());
    }
}
#[test]
fn old_legacy_recheck_preserves_verified_ready_and_its_install_barrier() {
    let root=tempfile::tempdir().unwrap();let(h,install,source)=ready_owner(root.path());
    h.shared.coordinator.lock().unwrap().as_ref().unwrap().set_state(Phase::Ready,Some("9.0.1".into()),Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED".into()));
    let(mut m,_,_)=super::super::tests::fixture(BUILD_VERSION,1,&[("Ameow.exe",b"legacy")]);m.schema=1;m.bundle_sha256=None;
    fs::write(source.join("manifest.json"),super::super::fixture_envelope(&m)).unwrap();fs::remove_file(source.join("package.zip")).unwrap();
    let before=serde_json::to_value(install.state().unwrap()).unwrap();h.send(Action::Check);
    wait(||h.snapshot().check_retry_secs>0 && h.snapshot().update.phase==Phase::Ready);
    assert_eq!(h.snapshot().update.error.as_deref(),Some("E_APP_UPDATE_AUTHORIZATION_CANCELLED"));assert!(h.snapshot().check_error.is_none());
    assert_eq!(serde_json::to_value(install.state().unwrap()).unwrap(),before);install.verify_release(&install.state().unwrap().pending.unwrap()).unwrap();
}
