---
title: Download Runtimes and Automatic Preparation
description: Understand why Ameow may spend time in a preparing state before a web download starts and what users should do.
---

Some web-download flows need extra runtime components for probing, downloading, or conversion. Ameow tries to prepare those pieces automatically, which is why you may see `Preparing` for a while on first use or after an update.

## What might you see?

Common signs:

- the first download of a site type takes longer to prepare;
- the queue shows `Preparing` before it starts downloading;
- the task moves into `Converting` after the download;
- after an update, some capabilities need to be prepared again.

This is not automatically an error. First decide whether it looks like normal preparation or an abnormal stall.

## How do I tell normal prep from a problem?

| What you see | More likely | What to do |
| --- | --- | --- |
| First use, then it continues after a short delay | Normal preparation | Wait |
| Several public links all stay in `Preparing` for a long time | Runtime prep or network issue | Restart Ameow and test with another public link |
| Only one site stalls in `Preparing` | Site rules, login state, or link issue | Send it from the extension and check site support |
| The task spends time in `Converting` after download | Format processing | Wait until conversion ends |

## Do users need to install tools manually?

Usually no. Ameow is designed to manage the needed download and processing capabilities itself when possible.

If the docs or Release Notes do not explicitly ask you to install something, avoid changing your system PATH, swapping internal tools, or downloading random external binaries.

## What should I do if it stays in Preparing too long?

Work through this order:

1. wait a little first and rule out normal first-run preparation;
2. confirm the network can reach the site;
3. test with a public link that does not need login;
4. restart Ameow;
5. update to the latest stable release;
6. if the content needs login state, send it through the browser extension.

If even public links keep stalling in `Preparing`, note the version, platform, and link type. That makes later bug reports much easier to investigate.

## How does this relate to download failures?

A failure during preparation is still a download failure, but the fix path depends on the state: task never appears, stays in `Preparing`, explicitly fails, or says `Done` but no file exists. Different states need different checks.
