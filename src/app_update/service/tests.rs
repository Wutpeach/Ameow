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
    assert_eq!(h.snapshot().preferences,Preferences{auto_check:true,auto_download:true,idle_restart:false});
    let prefs=Preferences{auto_check:false,auto_download:false,idle_restart:true};
    assert!(h.send(Action::Save(prefs.clone())));wait(||h.snapshot().saved);
    assert_eq!(h.snapshot().preferences,prefs);drop(h);
    let (h,_)=owner(root.path(),None);wait(||h.snapshot().preferences==prefs);drop(h);
    fs::remove_file(root.path().join("app-update-settings.json")).unwrap();fs::create_dir(root.path().join("app-update-settings.json")).unwrap();
    let (h,_)=owner(root.path(),None);wait(||h.snapshot().save_error.is_some());
    assert!(h.send(Action::Save(prefs)));wait(||!h.snapshot().saving);
    assert!(h.snapshot().save_error.is_some());assert_eq!(h.snapshot().preferences,Preferences::default());assert!(!h.snapshot().saved);
}
#[test]
fn manual_check_and_download_work_with_automatic_checks_disabled(){
    let root=tempfile::tempdir().unwrap();let source=source(root.path(),b"verified fixture");
    let (h,install)=owner(root.path(),Some(source));
    assert!(h.send(Action::Save(Preferences{auto_check:false,auto_download:true,idle_restart:false})));wait(||h.snapshot().saved);
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
        h.send(Action::Save(Preferences{auto_check:false,auto_download:false,idle_restart:false}));
        wait(||h.snapshot().saved);
        h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Available);
        assert!(install.state().unwrap().pending.is_none());
        h.send(Action::Download);wait(||h.snapshot().update.phase==Phase::Ready);
        let pending=install.state().unwrap().pending.unwrap();
        assert_eq!(pending.version,"9.0.1");install.verify_release(&pending).unwrap();
        assert_eq!(fs::read(install.root.join("versions/9.0.1/manifest.json")).unwrap(),envelope);
    }
}
#[test]
fn reenabling_background_download_prepares_the_already_discovered_signed_version(){
    let root=tempfile::tempdir().unwrap();let source=source(root.path(),b"verified fixture");let(h,install)=owner(root.path(),Some(source));
    assert!(h.send(Action::Save(Preferences{auto_download:false,..Default::default()})));wait(||h.snapshot().saved);
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
    h.send(Action::Save(Preferences{auto_download:false,..Default::default()}));wait(||h.snapshot().saved);
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
fn production_source_is_closed_before_fixture_or_network_and_source_failure_is_visible(){
    let root=tempfile::tempdir().unwrap();let production=Install::production(root.path().join("production")).unwrap();
    assert_eq!(read_source(&production,Some(root.path()),&AtomicBool::new(false)).unwrap_err(),"E_APP_UPDATE_TRUST_NOT_CONFIGURED");
    let(h,_)=owner(root.path(),Some(root.path().join("missing")));h.send(Action::Check);wait(||h.snapshot().update.phase==Phase::Failed);
    assert!(h.snapshot().update.error.unwrap().contains("E_APP_UPDATE_SOURCE"));
}
fn restart_fixture(root:&Path)->(Handle,Session,DownloadCoordinator){
    let install=Install::fixture(root.join("install")).unwrap();super::super::tests::prepare(&install,"9.0.1",1);
    let session=Session::for_test(install);
    let h=Handle::inert(View{launcher:true,preferences:Preferences{idle_restart:true,..Default::default()},..Default::default()});
    *h.shared.coordinator.lock().unwrap()=Some(session.coordinator.clone());
    (h,session,DownloadCoordinator::update_test_queue(root))
}
#[test]
fn manual_tasks_require_a_choice_repeated_actions_share_one_drain_and_later_reopens_admission(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    q.submit("https://youtu.be/00000000001".into()).unwrap();
    h.send(Action::Restart);h.clone().send(Action::Restart);h.poll(&q,Some(&s));
    assert!(h.snapshot().confirmation);assert!(!q.snapshot().stopping);
    q.submit("https://youtu.be/00000000002".into()).unwrap();
    h.send(Action::Wait);h.poll(&q,Some(&s));s.poll(&q).unwrap();
    assert_eq!(h.snapshot().update.phase,Phase::WaitingForTasks);assert!(q.submit("https://youtu.be/00000000003".into()).is_err());assert!(!q.snapshot().stopping);
    h.send(Action::Later);h.poll(&q,Some(&s));s.poll(&q).unwrap();
    assert_eq!(h.snapshot().update.phase,Phase::Ready);assert!(q.submit("https://youtu.be/00000000003".into()).is_ok());assert!(!s.quit.load(Ordering::Acquire));
}
#[test]
fn automatic_restart_starts_on_the_first_safe_poll_without_a_quiet_period(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    h.poll(&q,Some(&s));assert!(q.snapshot().stopping);
    s.poll(&q).unwrap();assert!(!s.quit.load(Ordering::Acquire));assert!(!q.snapshot().stopped);
}
#[test]
fn automatic_restart_requires_ready_and_enabled_and_keeps_accepted_tasks_running(){
    let root=tempfile::tempdir().unwrap();let(h,s,q)=restart_fixture(root.path());
    h.shared.view.lock().unwrap().preferences.idle_restart=false;
    h.poll(&q,Some(&s));assert!(!q.snapshot().stopping);
    h.shared.view.lock().unwrap().preferences.idle_restart=true;
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
    h.shared.view.lock().unwrap().saving=false;h.poll(&q,Some(&s));assert!(q.snapshot().stopping);
    s.poll(&q).unwrap();assert!(!s.quit.load(Ordering::Acquire));assert!(!q.snapshot().stopped);
    assert!(q.submit("https://youtu.be/00000000001".into()).is_err());
}
