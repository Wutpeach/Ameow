//! Task-only native probe: preserve actual supervised component failure evidence.
use ameow_next::download::{composition, process_supervisor::{self, Control, ProcessSpec}};
use std::{path::PathBuf, sync::Arc, time::Duration};
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(&args[2]);
    std::fs::create_dir_all(&root).unwrap();
    let result = process_supervisor::run(ProcessSpec {
        executable: PathBuf::from(&args[1]),
        args: vec!["--ignore-config".into(), "--no-plugin-dirs".into(), "--version".into()],
        cwd: root.clone(), env: composition::requirements().environment(&root).unwrap(),
        stdout_limit: 65536, stderr_limit: 65536, timeout: Some(Duration::from_secs(20)),
    }, &Control::default(), Arc::new(|_| {}));
    std::fs::write(root.join("result.txt"), format!("{result:#?}")).unwrap();
}
