---
title: Command line and agents
description: Get the Ameow CLI, submit tasks from a terminal, and read results from the desktop queue.
---

`ameow-cli` lets scripts and agents control the current user's local Ameow queue. It shares tasks, components, and download results with the desktop app. No extension or GUI setting is required.

## Check availability first

**The current stable v0.5.0 release does not include the CLI added afterward.** This page describes upcoming capabilities. To use them now, obtain a matching complete candidate package that includes the CLI, or build source that contains it. Installing v0.5.0 from the downloads page will not add this command.

The ordinary CLI controls the queue owned by the desktop app. The `dev` entry is only for debug source builds with `dev-tools` enabled. Check the actual release notes for CLI availability in future complete releases.

## Install and invoke

### Windows

In a **complete installer or portable package that includes the CLI**, `ameow-cli.exe` sits beside `AmeowLauncher.exe`. Install or extract the entire package, and keep its directory structure intact.

In PowerShell, replace this path with your actual installation or extraction directory:

~~~powershell
$Cli = 'D:\Apps\Ameow\ameow-cli.exe'
& $Cli --help
~~~

You can optionally add that directory to your user `PATH`, then use `ameow-cli --help`. Installation does not register a global command or change your `PATH`. Use `./ameow-cli.exe` when running from its current directory; `&` above is PowerShell's syntax for invoking a quoted path.

### Mac

In a complete `Ameow.app` that includes the CLI, the entry is `Contents/MacOS/ameow-cli`. For an app in `/Applications`, run this in zsh or bash:

~~~sh
cli='/Applications/Ameow.app/Contents/MacOS/ameow-cli'
"$cli" --help
~~~

Adjust the path if the app is in `~/Applications`. An optional alias for the current shell is:

~~~sh
alias ameow-cli='/Applications/Ameow.app/Contents/MacOS/ameow-cli'
ameow-cli --help
~~~

To keep it, add the alias to your shell configuration yourself. Ameow does not install a global command or edit `PATH`. Invoke the CLI from its original app bundle, preserving bundle members and signatures.

## Submit and read results

Have a public media URL you want to download ready. After setting `$Cli` above, this PowerShell example asks for the link:

~~~powershell
$Url = Read-Host 'Public media URL'
$Receipt = & $Cli --json submit $Url | ConvertFrom-Json
$Receipt
~~~

If the receipt has `ok: true`, use its complete `task_id` to inspect or wait:

~~~powershell
$Task = $Receipt.result.task_id
& $Cli --json show $Task
& $Cli --json wait $Task --timeout 300
~~~

In zsh/bash on Mac, set `cli` as above, then submit:

~~~sh
printf 'Public media URL: '
IFS= read -r url
"$cli" --json submit "$url"
~~~

Copy the complete `task_id` from the successful receipt to replace `INSTANCE:JOB` below. This is a placeholder; keep the instance portion as well as the job number:

~~~sh
task='INSTANCE:JOB'
"$cli" --json show "$task"
"$cli" --json wait "$task" --timeout 300
~~~

If no instance is available, `submit` starts the adjacent ordinary app, through the Launcher on Windows. The desktop instance still owns the tasks. Other task and status commands do not start the app. Use `--no-start` to disable automatic startup when submitting.

| Command | Purpose |
| --- | --- |
| `submit URL` | Submit, optionally selecting a quality preset and `--output DIR` |
| `list`, `show INSTANCE:JOB` | List tasks or inspect one |
| `wait INSTANCE:JOB --timeout 300` | Wait up to 300 seconds for an authoritative result and actual files |
| `cancel INSTANCE:JOB`, `retry INSTANCE:JOB` | Cancel or retry; read the task ID returned by retry |
| `settings`, `components`, `diagnose` | Read preferences, component status, or safe diagnostics; diagnostics can take a task ID |

`URL`, `DIR`, and `INSTANCE:JOB` in this table are placeholders. Downloadability depends on the downloader and site. Quality values are `--quality highest`, `--quality balanced`, or `--quality saver`; the output directory must already exist. Submission options affect only this task, not saved defaults.

## For scripts

With `--json`, stdout contains one machine result without log messages. `wait` returns exit code 0 for success, 3 for partial success, 4 for failure, 5 for cancellation, and 6 for timeout. See the repository [CLI reference](https://github.com/Wutpeach/Ameow/blob/main/docs/cli.md) for all fields and errors.

A cancellation receipt with `applied: true` acknowledges intent only. `Held` or `resources_released: false` means cleanup is unconfirmed, not Cancelled. Exiting or interrupting the CLI, or reaching a wait timeout, does not cancel desktop tasks. Old task IDs become invalid after the instance restarts.

## Updates and source builds

Windows single-EXE automatic updates replace only the desktop app; update the CLI through a complete installer or portable package. On Mac, the CLI updates with the full app bundle and participates in signature checks. Do not place a lone CLI EXE beside another version or mix candidate and stable package members. Protocol mismatches return an explicit error.

To build from source now, use a separate directory as described in [CLI developer resources](../developer/#cli). Ordinary control does not require `dev-tools`. The separate `ameow-cli dev` entry requires a debug build with `--features dev-tools`; release builds explicitly reject that feature. It is not a setting you can enable in a distributed release.
