# Validation — 2026-11-16

Windows x86_64-pc-windows-msvc，Rust 1.98.1，locked/offline，static CRT。下载相关 all-targets check 通过；下载模块 152 passed / 12 ignored；download_contracts 9 passed / 3 ignored；neutral_download_boundary 2 passed。按需显式运行的 pinned_ffprobe 真实工具测试另行通过。未将 ignored 项计入通过。

回归覆盖无音轨、未知 codec/height/audio、缺标题、URL 规范化和短链、可选 before_dl、明确身份/音轨/画质矛盾、图库非 fixture 元数据和成功警告、集合续作、实际图片/视频分派、非 owned 路径及无覆盖发布。真实媒体回归曾捕获错后缀 MKV 被 image2 误探测，修复后同一反例及无扩展名 TIFF、raw H264 缺 format.duration、HTML 坏文件均得到预期结果。

既有 Pinterest 样本完成原生解析、传输、实际媒体核验和最终交付（720×720，无音轨）；既有 Bluesky 样本经 gallery-dl 完成实际图片解码与交付。随后应用使用的 DownloadCoordinator 完成同一 Pinterest 样本：重复提交拒绝，新文件以 (1).mkv 交付，原文件 SHA256 不变，terminal_count=1、resources_released=true、active_slots=0、stopped=true。上述均为真实下载/交付证据，不是仅解析成功。

GPUI 自动启动在创建 PowerShell 进程前被自动审批拒绝，唯一理由为 `blocked by policy`；没有应用 PID，未启动 GUI，未验证本次 UI Submit、视觉或键鼠流程。未改工具或入口重试。工作树外准备固定 EXE、哈希及隔离 runtime/settings/output 的人工入口，交由来源协调人工检查。第三方 W3 样本因 Cloudflare 403 失败，未算成功。未进行 Mac 原生验证或改动其工作树。

完整日志在本工作树 evidence/downloader-authority；交付副本、人工入口、依赖说明与可移植补丁放在 D:/Ameow-handoffs/downloader-authority-20261116-f7875c9e。独立外部审查和 GUI 人工验收尚未完成；本记录是实现者定向自查与实际测试结果。
