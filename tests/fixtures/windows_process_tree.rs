//! Native, dependency-free child fixture. Never linked into the application.
use std::{
    ffi::c_void,
    fs::OpenOptions,
    io::{self, Write},
    os::windows::process::CommandExt,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::Duration,
};
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentProcess() -> *mut c_void;
    fn IsProcessInJob(process: *mut c_void, job: *mut c_void, result: *mut i32) -> i32;
    fn GetConsoleWindow() -> *mut c_void;
    fn SetEvent(event: *mut c_void) -> i32;
}
fn marker(path: &Path, role: &str) {
    let mut member = 0;
    assert_ne!(
        unsafe { IsProcessInJob(GetCurrentProcess(), std::ptr::null_mut(), &mut member) },
        0
    );
    let console = !unsafe { GetConsoleWindow() }.is_null();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    writeln!(
        file,
        "{role} {} job={member} console={console}",
        std::process::id()
    )
    .unwrap();
    file.flush().unwrap();
}
fn spawn(mode: &str, path: &Path, null_output: bool) {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .arg(mode)
        .arg(path)
        .stdin(Stdio::null())
        .creation_flags(0x08000000);
    if null_output {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    } else {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    }
    // Dropping std Child neither terminates nor waits; production Job owns the tree.
    let _ = command.spawn().unwrap();
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let mode = &args[1];
    let path = Path::new(&args[2]);
    match mode.as_str() {
        "root-first" => {
            marker(path, "root");
            spawn("short-child", path, true);
        }
        "short-child" => {
            marker(path, "child");
            spawn("short-grandchild", path, true);
            thread::sleep(Duration::from_millis(850));
        }
        "short-grandchild" => {
            marker(path, "grandchild");
            thread::sleep(Duration::from_millis(1000));
        }
        "tree" => {
            marker(path, "root");
            spawn("child", path, false);
            println!("root ready");
            thread::sleep(Duration::from_secs(60));
        }
        "child" => {
            marker(path, "child");
            spawn("grandchild", path, false);
            thread::sleep(Duration::from_secs(60));
        }
        "grandchild" => {
            marker(path, "grandchild");
            thread::sleep(Duration::from_secs(60));
        }
        "flood" => {
            marker(path, "root");
            let stderr = thread::spawn(|| {
                let bytes = [b'E'; 8192];
                let mut output = io::stderr().lock();
                for _ in 0..256 {
                    output.write_all(&bytes).unwrap();
                }
                output.flush().unwrap();
            });
            let bytes = [b'O'; 8192];
            let mut output = io::stdout().lock();
            for _ in 0..896 {
                output.write_all(&bytes).unwrap();
            }
            output.flush().unwrap();
            stderr.join().unwrap();
            marker(path, "flood-done");
        }
        "echo" => {
            marker(path, "root");
            for arg in &args[3..] {
                println!("{arg}");
                if let Some(raw) = arg.strip_prefix("sentinel:") {
                    let event = raw.parse::<usize>().unwrap() as *mut c_void;
                    println!("SENTINEL_SET={}", unsafe { SetEvent(event) });
                }
            }
            println!("PATH={}", std::env::var("PATH").unwrap_or_default());
            println!(
                "TEST={}",
                std::env::var("AMEOW_TEST_ONLY").unwrap_or_default()
            );
            println!("CWD={}", std::env::current_dir().unwrap().display());
        }
        _ => panic!("unsupported native fixture mode"),
    }
}
