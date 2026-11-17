use std::{io, path::Path, process::Command};

fn command(path: &Path) -> Command {
    #[cfg(target_os = "windows")]
    let mut command = {
        let explorer = std::env::var_os("WINDIR")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from("C:/Windows"))
            .join("explorer.exe");
        Command::new(explorer)
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("/usr/bin/open");
        command.arg("--");
        command
    };
    command.arg(path);
    command
}

/// Call on a background owner; each surface retains its eligibility and feedback.
pub fn open_directory(path: &Path) -> io::Result<()> {
    let mut command = command(path);
    #[cfg(target_os = "windows")]
    return command.spawn().map(|_| ());
    #[cfg(target_os = "macos")]
    {
        if command.status()?.success() {
            Ok(())
        } else {
            Err(io::Error::other(
                "System file manager exited unsuccessfully",
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    #[test]
    fn directory_is_one_exact_argument_without_shell_interpretation() {
        let path = Path::new("目录 空格/--作品");
        let command = command(path);
        let args: Vec<_> = command.get_args().collect();
        #[cfg(target_os = "windows")]
        {
            assert_eq!(args, [path.as_os_str()]);
            assert_eq!(
                Path::new(command.get_program()).file_name(),
                Some(OsStr::new("explorer.exe"))
            );
        }
        #[cfg(target_os = "macos")]
        {
            assert_eq!(command.get_program(), OsStr::new("/usr/bin/open"));
            assert_eq!(args, [OsStr::new("--"), path.as_os_str()]);
        }
    }
}
