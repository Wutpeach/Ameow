//! Separate cancellation settlement for the Adapter's actual trusted Transfer.
use crate::download::runtime::{self, RuntimeLease};
use ring::rand::{SecureRandom, SystemRandom};
use serde::Deserialize;
use std::{
    collections::BTreeSet,
    io::Read,
    path::{Path, PathBuf},
};

const DRIVER: &str = include_str!("cancellation_macos.py");
const RECORD: &str = "transfer-cancel.json";
const RECORD_LIMIT: u64 = 4096;

pub(crate) struct Cancellation {
    nonce: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    schema: u32,
    nonce: String,
    root_pid: u32,
    kind: String,
    work_creation_closed: bool,
    workers_joined: bool,
    direct_children_waited: bool,
    reaped: Vec<[u32; 2]>,
}

impl Cancellation {
    pub(crate) fn invocation(
        python: PathBuf,
        archive: &Path,
        args: Vec<String>,
        lease: &RuntimeLease,
    ) -> Result<(PathBuf, Vec<String>, Self), String> {
        let tools = ["ffmpeg.exe", "ffprobe.exe", "deno.exe"]
            .into_iter()
            .map(|tool| {
                lease
                    .file(tool)?
                    .to_str()
                    .map(str::to_owned)
                    .ok_or_else(|| "Runtime tool path is not valid UTF-8".to_owned())
            })
            .collect::<Result<Vec<_>, String>>()?;
        let mut random = [0; 32];
        SystemRandom::new()
            .fill(&mut random)
            .map_err(|_| "Could not create Transfer cancellation identity")?;
        let nonce = random
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let mut command = vec![
            "-I".into(),
            "-B".into(),
            "-c".into(),
            DRIVER.into(),
            nonce.clone(),
            serde_json::to_string(&tools).map_err(|e| e.to_string())?,
            archive
                .to_str()
                .ok_or("Runtime zipapp path is not valid UTF-8")?
                .into(),
        ];
        command.extend(args);
        Ok((python, command, Self { nonce }))
    }

    pub(super) fn complete(&self, workspace: &Path, root_pid: u32, exit_code: u32) -> bool {
        if exit_code != 130 {
            return false;
        }
        let path = workspace.join(RECORD);
        let Ok(identity) = runtime::identity::PathIdentity::capture(&path) else {
            return false;
        };
        let Ok(file) = runtime::open_identity_file(&path) else {
            return false;
        };
        if !file
            .metadata()
            .is_ok_and(|m| m.is_file() && m.len() <= RECORD_LIMIT)
        {
            return false;
        }
        let mut bytes = Vec::new();
        if (&file)
            .take(RECORD_LIMIT + 1)
            .read_to_end(&mut bytes)
            .is_err()
            || bytes.len() > RECORD_LIMIT as usize
            || !bytes.ends_with(b"\n")
            || identity.validate_handle(&file).is_err()
        {
            return false;
        }
        let Ok(receipt) = serde_json::from_slice::<Receipt>(&bytes) else {
            return false;
        };
        let mut children = BTreeSet::new();
        receipt.schema == 1
            && receipt.nonce == self.nonce
            && root_pid != 0
            && receipt.root_pid == root_pid
            && receipt.kind == "cancelled"
            && receipt.work_creation_closed
            && receipt.workers_joined
            && receipt.direct_children_waited
            && receipt.reaped.len() <= 64
            && receipt.reaped.iter().all(|[pid, status]| {
                *pid > 0 && *pid != root_pid && *status <= 65535 && children.insert(*pid)
            })
    }

    #[cfg(test)]
    pub(super) fn fixture(nonce: &str) -> Self {
        Self {
            nonce: nonce.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn receipt() -> serde_json::Value {
        serde_json::json!({"schema":1,"nonce":"fresh","root_pid":42,"kind":"cancelled",
            "work_creation_closed":true,"workers_joined":true,"direct_children_waited":true,"reaped":[[43,9]]})
    }
    fn write(path: &Path, record: &serde_json::Value) {
        fs::write(path, format!("{record}\n")).unwrap();
    }
    #[test]
    fn cancellation_requires_current_identity_and_every_barrier() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(RECORD);
        let contract = Cancellation::fixture("fresh");
        assert!(!contract.complete(root.path(), 42, 130));
        let good = receipt();
        write(&path, &good);
        assert!(contract.complete(root.path(), 42, 130));
        assert!(!contract.complete(root.path(), 41, 130));
        assert!(!contract.complete(root.path(), 42, 0));
        for (key, value) in [
            ("nonce", serde_json::json!("old")),
            ("root_pid", serde_json::json!(43)),
            ("kind", serde_json::json!("complete")),
            ("schema", serde_json::json!(2)),
            ("work_creation_closed", serde_json::json!(false)),
            ("workers_joined", serde_json::json!(false)),
            ("direct_children_waited", serde_json::json!(false)),
            ("reaped", serde_json::json!([[43, 9], [43, 9]])),
            ("unknown", serde_json::json!(true)),
        ] {
            let mut bad = good.clone();
            bad[key] = value;
            write(&path, &bad);
            assert!(!contract.complete(root.path(), 42, 130), "{key}");
        }
        for key in good.as_object().unwrap().keys() {
            let mut bad = good.clone();
            bad.as_object_mut().unwrap().remove(key);
            write(&path, &bad);
            assert!(!contract.complete(root.path(), 42, 130), "missing {key}");
        }
    }
    #[test]
    fn cancellation_rejects_partial_duplicate_oversize_and_symlink_records() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(RECORD);
        let contract = Cancellation::fixture("fresh");
        for bytes in [
            receipt().to_string(),
            format!("{}\n{}\n", receipt(), receipt()),
            "x".repeat(RECORD_LIMIT as usize + 1),
            format!("{{\"schema\":1,\"schema\":1}}\n"),
        ] {
            fs::write(&path, bytes).unwrap();
            assert!(!contract.complete(root.path(), 42, 130));
        }
        fs::remove_file(&path).unwrap();
        write(&root.path().join("other.json"), &receipt());
        std::os::unix::fs::symlink(root.path().join("other.json"), &path).unwrap();
        assert!(!contract.complete(root.path(), 42, 130));
    }
}
