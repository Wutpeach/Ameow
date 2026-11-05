# #21 FFmpeg 无缓存冷启动定向修复

2026-11-05。针对独立验收 REPAIR：https://github.com/Wutpeach/Ameow/issues/21#issuecomment-6646163939 。本轮开发验证通过，待网页 GPT 复验；不将开发验证视为最终验收。

## 修复内容

旧固定 FFmpeg 地址本轮复查仍为 HTTP 404（`old-url-check.json`）。已替换为 **Gyan FFmpeg 9.0.2 essentials static Windows x64** 的固定版本 ZIP：

`https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip`

Gyan 是 https://ffmpeg.org/download.html 列出的 Windows 构建来源。使用版本 tag `9.0.2`，不使用滚动 latest、系统 FFmpeg 或未校验镜像。归档大小 **114,768,076 bytes**，实测 HTTP 200；SHA-256 同时匹配 GitHub 资产摘要（asset ID 574302090）与发布方版本化 checksum：

`https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip.sha256`

| 资产 | SHA-256 |
| --- | --- |
| ZIP | `60F467265B1E312373DBCD92200C2618A74850F98D3D078E94296BB3FA2047BA` |
| `ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe` | `3256173F3F8BFFD7DF12227C68ADF68025EDB1832273A9530688A7BB1ED8EDEC` |
| `ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe` | `F0D36ECBBDD3BCFAC3EFA078C96C7271C2E68B3810595552AC3B7F17E9A65C52` |

两个程序的版本探针均为 `9.0.2-essentials_build-www.gyan.dev`，构建开启 GPL/version3，不含 libfdk-aac。FFmpeg 来源 tag `n9.0.2`，发布方指向源码 commit `946fcce07b`；同步了来源和 GPL 通知。归档摘要及内部文件身份均核实；未声称验证了 detached signature。

相对上一轮已验收工作区，**仅 4 个文件发生变化**：

- `assets/runtime-manifest.json`：FFmpeg 版本、URL、归档大小/摘要、内部路径/摘要和版本探针。其他三个组件的固定身份未改。
- `assets/runtime-notices.md`、`distribution/notices/runtime-acquisition.md`：新固定资产的可信来源、checksum 与许可指针。
- `src/download/collection_tests.rs`：新增一个显式运行的空缓存图片/视频集成验证。

`repair-scope.json` 核对上一轮 33 个源码/配置文件，另外 **29 个文件摘要完全不变**，包含 runtime/network 获取算法、缓存复用实现、gallery adapter、自动路由、重试和全部 UI。保留现有归档/内部文件哈希校验、版本 probe、只读 lease、先校验后复用旧缓存、新 stage 发布与旧目录保留机制；没有额外架构或自动重试。

## 独立空缓存 Windows 验证

环境：当前 Windows x64 / MSVC 开发机器，沿用现有 Windows 网络/代理配置；gallery-dl 所需 VC++ x86 redistributable 已具备。验证的是**空应用 runtime/cache**，不是全新 Windows 虚拟机或依赖安装器验收。

成功运行目录：`D:/Ameow/target/issue21-ffmpeg-repair-20261105/cold-run-2`。测试断言整个目录及其 runtime 在开始时不存在，未复制或预置任何组件。直接调用 production `RuntimeManager` 获取完整 production requirements，再由 production download coordinator 执行图片和视频任务。研究用 ZIP 位于其父目录，不进入 runtime 的缓存搜索范围。

| 组件 | 实际获取字节 | 后续步骤 |
| --- | ---: | --- |
| yt-dlp 2026.08.19 | 17,840,399 | Verify → Extract → Probe |
| Deno 2.9.7 | 42,630,221 | Verify → Extract → Probe |
| FFmpeg 9.0.2 | 114,768,076 | Verify → Extract → Probe |
| gallery-dl 1.32.19 | 22,627,366 | Verify → Extract → Probe |

所有 5 个安装后的 EXE 再次按 manifest 摘要回读核对，并运行版本 probe，均通过。完整过程见 `acquisition.json`、`installed-runtime.json`。

随后在同一新目录完成：

- 图片 `https://imgur.com/21yMxCS`：**Success**，根目录 `21yMxCS.png`，182 bytes，PNG 32 px 高；SHA-256 `EB359CD8F02A7D6762F9863798297FF6A22569C5C87A9D38C55BDB3A3E26003F`。这是上游公开真实小图片样本，不是伪造的媒体文件。
- 原 yt-dlp 视频路径 `https://youtu.be/jNQXAC9IVRw`：**Success**，`jNQXAC9IVRw.mkv`，683,446 bytes，H.264 240p + Opus 音轨；SHA-256 `80FAEA7D24D019E58FFA839BB23C7EB76C0A9E6E5F7E1256ACBC21BCEA9DCCF4`。
- 两个最终文件均重新核对大小和 SHA-256，使用这次安装的新 ffprobe 读取流，再以新 FFmpeg 完整解码，exit=0。停止后 active slots=0，全部任务 resources_released=true。

原始记录：`image.json`、`video.json`、`stopped.json`；流信息 `image-ffprobe.json`、`video-ffprobe.json`；精简结果 `delivery-verification.json`。媒体本体留在上述运行目录的 `output/`，没有改写上一轮已验收文件。

首个空目录 `cold-run` 的应用内验证曾在 FFmpeg Acquire 阶段遇到 `Unknown` 网络错误、http_status=None，未取得完整资产，也未进入交付。这不是旧 URL 的 HTTP 404，具体网络原因未分类。保留了 `cold-download-test.txt` 和 `first-attempt-acquisition.json`；换全新空目录后成功，未绕过校验或增加网络恢复代码。不把第一次失败算作 PASS。

## 最低必要回归

- `cargo test --lib real_cold_runtime_image_and_video_delivery -- --ignored --nocapture`：**1 passed / 0 failed**，90.44s。见 `cold-download-retest.txt`。
- `cargo test --lib download::runtime::requirement_tests -- --test-threads=4`：**8 passed / 0 failed**。覆盖 catalog 扩展时哈希验证后复用、损坏缓存恢复且旧目录保留、有效缓存禁用获取仍可用、离线候选边界、固定 manifest/子集身份、精确版本 probe 和环境隔离。见 `runtime-regressions-final.txt`。
- `cargo test --test download_contracts hash_lease_rejects_corruption_and_prevents_live_mutation -- --exact`：**1 passed / 0 failed**。见 `hash-regression.txt`。
- `cargo build --bin ameow`、`git diff --check`：通过。

测试最初引用了队列终态未暴露的 `facts` 字段而编译失败，已改用真实交付字段；最终媒体流以受管 ffprobe 独立复核。早期编译记录保留在 `runtime-regressions.txt`，通过结果以 `runtime-regressions-final.txt` 为准。

共 **10 项定向测试通过**；未重跑此前 288 项或 UI 矩阵。上一轮路由、Partial 重试、UI 和其他非阻断边界继续复用独立验收结论；没有扩大本轮验证声明。

## 交接身份与复现

本地分支 `main`，HEAD 仍为 `0493a23beb4e2f46845496a80791168d2968e60e`，本轮和先前 #21 实现均未提交。最终开发 EXE `D:/Ameow/target/debug/ameow.exe`，SHA-256 **`E29803671FD910172C8D8F9CDCCE00501D291B871E4A11B2040B1D005761BD81`**。原 #21 已验收 EXE（C419…11CE）另存 `target/issue21-ffmpeg-repair-20261105/issue21-accepted-development.exe`，#20 和上一轮截图、产物均保留。

`source-after.json` 绑定此次源码及开发 EXE；`evidence-manifest.json` 记录本修复目录的证据身份。旧的 #21 报告和证据清单保留为原检查点，本补充报告更新其中“FFmpeg 无缓存仍受 404 阻断”的结论。

```powershell
# 必须使用尚不存在的新目录，不覆盖本次证据。
$env:AMEOW_GALLERY_TEST_ROOT = 'D:/Ameow/target/issue21-ffmpeg-repair-another-run'
cargo test --lib real_cold_runtime_image_and_video_delivery -- --ignored --nocapture
```

未重测的既有事项：Imgur 相册网络、跨 attempt .part、实际跨引擎回退、Bilibili 本轮重下、macOS/混合 DPI 和 clippy；继续保留前轮限制。本修复未产出安装包或发布资产，未提交、push、merge、发布或关闭 Issue。等待网页 GPT 复验。
