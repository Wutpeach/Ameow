# CLI 开发入口

开发和 Agent 回归使用同一个固定 target。无需打开 Ameow 或桌面会话：

~~~powershell
cargo run --locked --features dev-tools --bin ameow-cli -- dev scenario --root evidence/dev-success --case success
~~~

每次选择新根目录。命令创建 settings.json、runtime/、output/、evidence/，保存结果后退出。
普通构建拒绝 dev；dev-tools 在 release 编译时被拒绝。它不创建桌面 owner、控制 socket、托盘或生产更新会话。
普通控制 CLI 的用法与任务生命期见 [cli.md](cli.md)。

## 固定离线场景

先编译一次，随后调用同一 EXE（Mac 去掉 .exe）：

~~~powershell
cargo build --locked --features dev-tools --bin ameow-cli
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-retry --case retry
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-cancel --case cancel
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-stop --case stop
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-held --case held
./target/debug/ameow-cli.exe dev scenario --root evidence/dev-timeout --case timeout
~~~

| case | 验证内容 | 预期退出 |
| --- | --- | --- |
| success | 正式队列、活动重复拒绝、生成真实文件、验证和无覆盖发布、Stop | 0 |
| retry | 首次 transfer 失败，再调用正式 retry，保留旧失败与新任务关联 | 0 |
| cancel | 正式 cancel，等待权威 Cancelled 与资源释放 | 5 |
| stop | 活动期间正式 Stop，等待 Cancelled、slot 释放及 stopped | 5 |
| held | 注入 Adapter owner panic，正式核心保留 Held；取消受理仍未结算 | 6，stopped=false |
| timeout | 到期请求 Stop，保留超时原因并核对实际结算 | 6，stopped=true |

这些都是 **synthetic-adapter-core**：使用固定 Data Adapter、正式协调器/Runner/验证发布，生成真实小文件；不执行原生下载器或联网。
held 的异常在正式核心的 owner panic 捕获边界产生，保留本次 runtime/workspace；它不证明 Windows Job/macOS fork 的原生清理路径。
原生进程 Held 的证据仍来自 [process-ownership](../openspec/specs/process-ownership/spec.md) 对应测试，不能用合成场景替换。

## 真实任务

~~~powershell
./target/debug/ameow-cli.exe dev run --root evidence/real-run --url https://example.com/media --quality balanced --timeout 120
~~~

run 使用正式 AutomaticAdapter、组件准备/校验和任务规则，下载公开 URL，不改变下载器的选流或可下载性判断。
最多 16 个重复的 --url；提交顺序固定。--quality 为 highest（默认）、balanced、saver，output 固定在本次根的 output/。

可组合的定向动作：

~~~powershell
ameow-cli dev run --root evidence/cancel-run --url URL --cancel-job 1 --cancel-after-ms 1500
ameow-cli dev run --root evidence/stop-run --url URL1 --url URL2 --stop-after-ms 2000
ameow-cli dev run --root evidence/retry-run --url URL --retry-failed --duplicate-first
~~~

cancel-job 是从 1 开始的输入序号。retry-failed 对每个输入最多显式重试一次，沿用正式 Failure/Partial 重试规则；重试创建新 ID 时保留 previous_task_id。
Gallery 续作保持同一任务 ID，等待新的 attempt；其回归同时覆盖 Failure 和 Partial，不把重试前终态当作本次完成。
取消或停止动作的 applied/受理事件都不表示终态。普通成功/Partial/Failure/Cancelled 退出分别为 0/3/4/5；参数错误为 2，开发启动/隔离拒绝为 9。

--timeout 默认 120 秒，--settle-timeout 默认 10 秒，均为 1–3600 秒。运行超时请求正式 Stop，退出 6；Stop 宽限期结束仍未结算时保存真实状态并退出 6。
Held/owner lost 一经观察立即写事件并输出 stderr 提示。工具不调用强杀，不把进程退出当作资源结算；非 stopped 结果必须按未确认处理。
外部 Ctrl+C/kill 不保证结果写完；缺少 result.json 即未完成，不能凭父进程退出码推导任务或后代已清理。
本入口不接受后续附着、任务续跑或持久历史；需要 GUI 联动时用普通控制 CLI。

根目录不能与生产 runtime 或安装域重叠，也不能复用已有运行目录。唯一允许的预置内容是自己拥有的 runtime/ **副本**；不要把生产缓存或其他任务目录作为本次根。
运行仍重新验证缓存、签名/组件身份和 Ready 条件。不要复制生产设置、认证材料或其他任务的应用/target。

## 本地真实媒体 fixture

--fixture-media-port PORT 仅对三个固定地址 http://example.com/ameow-issue33-1.mp4（以及 -2、-3）选择 127.0.0.1 上的端口；其他 URL 仍走正式系统路由。
这是显式 dev-tools debug 门槛，复用更新验证的固定本地媒体源，不开放任意本地 URL、代理或数据域。指定该端口时，所有输入必须属于上述三个固定地址；identity.transport 明确为 fixed-local-fixture。

复用 scripts/test_app_update_media_server.py。其根目录需 source.mp4、master.m3u8 和 hls/；可用已校验组件 ffmpeg 生成自己的小视频：

下列生成命令使用 Windows 组件的 libx264。Mac 组件未包含该编码器，可复用相同的受控输入，或选择本机 ffmpeg 实际提供的编码器；这不改变正式下载与验证路径。

~~~powershell
New-Item -ItemType Directory evidence/media/hls
ffmpeg -f lavfi -i testsrc2=size=96x64:rate=12 -t 2 -c:v libx264 -an evidence/media/source.mp4
ffmpeg -i evidence/media/source.mp4 -c copy -f hls -hls_time 1 -hls_playlist_type vod -hls_segment_filename evidence/media/hls/segment%03d.ts evidence/media/hls/index.m3u8
Set-Content -Encoding ascii evidence/media/master.m3u8 @('#EXTM3U','#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=96x64','VARIANT')
python scripts/test_app_update_media_server.py evidence/media
~~~

服务器将实际端口写入 server-port.json。在另一终端读取该端口，再运行：

~~~powershell
ameow-cli dev run --root evidence/local-real --url http://example.com/ameow-issue33-1.mp4 --fixture-media-port PORT --timeout 60
~~~

服务器对较大 .ts 传输保留 release-1/2/3 文件门槛；相应 release 文件放行该任务，stop 文件让服务器结束。它只提供固定本地文件，不转发外网。
fail-1/2/3 文件启用对应任务的 HTTP 503 故障；另建 recover-1/2/3 文件后恢复，失败前驱与恢复标记均保留。先观察正式 Failure/资源结算，再恢复并重试，才能验证失败→重试，而非下载器内部 HTTP 重试。
必要时先复制自己已验证的匹配 warm runtime 到新根 runtime/；缺失组件仍按正式规则准备，fixture 端口不改组件来源。
此回归标为 production-adapter + 固定本地路由，核对真实媒体、hash、slot 和退出，不能称为公网或 GUI 验收。

## 结果与证据

stdout 只有一条 JSON（不要求 --json）；stderr 为即时人读提示。自动保存：

- evidence/identity.json：随机 instance、PID、编译时 source_commit/source_sha256、实际 EXE SHA256、target、场景性质和期限。
- evidence/events.jsonl：单调 seq/elapsed_ms、instance、mutation request_id、task_id、重试关系与变化的状态；最多 2048 条，截断在最终结果标明。
- evidence/result.json：与 stdout 相同，含 exit_code、owner_settled、stopped、每任务 resources_released/slot、失败类别和已交付文件的字节/hash/verified_on_disk。

任务 ID 绑定本次 instance，不可用于普通桌面控制。source_commit 表示构建时提交，source_sha256 覆盖编译时跟踪与新增源码/构建输入；源码后来提交或文档变化不能改写旧 EXE 身份。
结果只记录域内相对文件路径、输入序号和受控状态，不记录 accepted URL、原始下载器输出、域外私有路径或认证内容。
最多核对 1024 个文件；超过时 files_truncated=true 且不报完整成功。业务 runtime 中的原始本地诊断和 settings 不属于可直接公开的脱敏结果。

## GUI 与工具替代

有 GUI 的真实联动使用普通 ameow-cli --instance-root NEW_ROOT --app APP submit/list/show/cancel/retry/wait/diagnose，见 [cli.md](cli.md)。
原生合成布局/故障注入使用 [Gallery](preview.md)，不创建真实下载 owner。Mac 焦点、粘贴与实际点击仍需真实原生手势；无 GUI 或固定截图均不能代验。

| 现有入口 | 职责与取舍 | 替代命令或保留验证 |
| --- | --- | --- |
| examples/download_job.rs | 单任务、定时取消；迁入 CLI 后删除 | dev run --root NEW --url URL，含 quality、cancel-after-ms 与正式停止 |
| examples/download_queue.rs | 多任务、重复/取消/停止与诊断；迁入后删除 | dev run 多 --url、--duplicate-first、--cancel-job、--stop-after-ms；自动状态与失败类别 |
| examples/macos_live_download_probe.rs | Mac 单任务真实下载；重复能力删除 | Mac 同一个 dev run，实际文件核对及 stopped/资源结果 |
| examples/runtime_update.rs、issue33_component_probe.rs | 显式组件更新/恢复、原生组件故障取证；保留 | dev run 不覆盖这些动作，按各 example 参数定向执行 |
| examples/macos_text_probe.rs | AppKit 文本/原生焦点；保留 | Mac 原生单项探针，不以 headless 代验 |
| examples/app_update_fixture.rs、release_fixture.rs | 公共测试密钥签名、包/Launcher/Ready fixture；保留 | app-update-fixture debug 构建及原签名/Ready 检查 |
| scripts/gallery.py、preview-scenes.json | 指定 EXE 实编目录、单场景/批量、ACK/截图/总览；保留 | python scripts/gallery.py --list / --scene NAME --capture NEW.png |
| scripts/native_capture.py、preview_capture.py | 原生 HWND、DPI、裁图与输入共享库，被 Gallery/UI 多处调用；保留 | test_gallery_tools.py 与受影响原生检查 |
| scripts/test_gallery.py、test_gallery_native.py、test_gallery_tools.py | Gallery 隔离/输入/截图/工具契约；保留 | 按 preview.md 选择；tools 不占桌面 |
| scripts/windows_validate.py、test_windows_validate.py、UI_REGRESSION.md、polish_f_core.py | 原生动作像素与反馈，polish 包装固定 hover；保留 | UI_REGRESSION.md 定向命令；CLI 不覆盖像素判据 |
| scripts/windows_cross_monitor.py、windows_shadow.py、windows_telemetry.py | 跨屏、阴影、窗口遥测；保留 | 自有窗口对应平台实测 |
| scripts/test_gpui_compatibility.py、test_gpui_migration.py | 控件键鼠、焦点/原生兼容；保留 | 对应原生流程，不以数据场景替代 |
| scripts/check_ring_motion.py、glow_removal_validate.py、test_mascot_native.py | 环/表面/猫动效与原生录像；保留 | 受影响动效定向录制和像素检查 |
| scripts/test_notices_scrollbar.py、test_tooltip_placement.py | 原生滚动条/tooltip 布局交互；保留 | 对应实际窗口检查 |
| scripts/verify_brand_icons.py、derive_macos_menu_bar_template.swift | 品牌源资产验证与 Mac 模板导出；保留 | 资产/原生菜单栏专项，不迁入任务 CLI |
| scripts/test_app_update_media_server.py | 固定受控媒体 fixture；共用保留 | 上述 --fixture-media-port，仍服务更新回归 |
| scripts/test_app_update_native.ps1、test_app_update_ui_native.ps1 | Launcher/更新事务、受限 token/Ready 与原生 UI；保留 | 原 app-update-fixture 路径/权限/签名要求 |
| scripts/package_portable.ps1、package_windows.ps1、package_macos.sh、test_release_preparation.ps1、test_windows_delivery.ps1 | 构建、许可、发行与交付；保留 | 原发行 CI/签发流程，不属于本次旧开发入口删除 |
| scripts/docs-sync.mjs、docs-sync.test.mjs、schedule-checks/ameow-docs-sync.mjs | 文档同步/审阅状态及调度；保留 | 文档独立流程，本次不启动或清理 |

上述三个 example 的历史参数不再兼容；替代命令统一使用完整根，避免继续提供默认生产 runtime 或任意 output 的工程入口。
不删除忽略的证据/缓存、交接、真实失败材料、旧工作树或已拒绝清理的任何路径。

## 回归

~~~powershell
cargo test --locked --test developer_cli
cargo test --locked --features dev-tools --lib control::dev::tests
cargo test --locked --features dev-tools --test developer_cli
~~~

第一项验证普通构建拒绝 dev。后两项分别验证核心/参数/日志边界和真实子进程的六个离线场景及退出。
正式下载器、本地媒体、原生进程守卫与 GUI 的实测覆盖以具体候选的验证记录为准。
