# #21 gallery-dl 开发报告与证据

日期：2026-11-05。实现已完成，待网页 GPT 验收。代码位于本地 `main` 未提交工作区；基线 `0493a23beb4e2f46845496a80791168d2968e60e`。没有 commit、push、merge、发布或关闭 Issue。开工前已读取 #21 完整要求及评论（当时无评论）；#20 已 CLOSED / COMPLETED，用户验收与收尾见 https://github.com/Wutpeach/Ameow/issues/20#issuecomment-6634662977 。

## 实现与首批范围

- 保留独立 yt-dlp 视频路径；同一入口按已接受对象自动选用 yt-dlp 或 gallery-dl。新增 Imgur 单图 `/id`、相册 `/a/id` 和 Bluesky 明确单帖图片集合；预检使用 gallery-dl 机器输出确认对象身份和完整图片清单，拒绝视频、间接对象、未知集合及错误结果。YouTube / Bilibili 单视频路由保留。
- gallery-dl 接入现有组件准备、固定版本/哈希、诊断、隔离环境、runtime lease、process supervisor 和取消收尾；不读取机器上其他工具或用户配置。没有新增引擎设置页或 HTTP 抓取实现。
- 一个任务交付多个文件。单图保存下载根目录，多文件创建作品名称子目录；处理 Windows 名称、Unicode、重名后缀，不覆盖用户文件。每个交付图片均核对签名、受管 FFmpeg 完整解码及摘要；gallery-dl 的 `after` / `skip` JSONL 是完成记录，普通日志不是成功依据。
- Partial 是独立终态；显示已保存数量，可靠总数存在时才显示分母，提供原行重试、复制诊断和清除。文件进度不伪造字节百分比。Full 沿用异常图标并显示“部分完成”；Compact 沿用当前产品隐藏详情的圆形。
- 重试保留同一 job ID、同一作品目录，核验之前的完整文件及摘要，再让 gallery-dl 原生跳过。对比完整预检文件清单，集合替换、丢失或用户修改文件均不能冒充全部完成，也不覆盖修改后的用户文件。未使用 download archive；不完整中间文件清理，未宣称跨 attempt `.part` 恢复已验证。
- 取消保持 Cancelled，停止下载，尽量保留安全完成文件。取消后的验证只做有限恢复：文件间 2 秒预算、单文件解码上限 1 秒；哈希、复制和进程收尾不包含在这 2 秒内，不承诺严格端到端 2 秒退出。
- 跨引擎选择限制为独立原生路径、相同对象范围、可恢复失败、每任务最多一次。首批对象没有已证明等价的独立重叠候选，实际候选均为空；本轮只有选择/拒绝边界测试，没有真实站点切换成功声明。封面替代或同一 yt-dlp extractor 重跑不构成回退。

主要代码：`src/download/adapters/gallery_dl/mod.rs`、`adapters/automatic.rs`；局部扩展 `contract.rs`、`mod.rs`、`queue.rs`、`output.rs`、`runtime.rs`；图片验证 `verification/image.rs`；沿用现有 UI 和 #20 预览工具。未增加 Cargo 依赖、插件框架或另一套任务管理器。

## Windows 实际验证

验证目标为 Windows x64 / MSVC。下面的网络测试使用真实 standalone、受管组件、现有 coordinator / supervisor、真实文件验证和交付；它们不是 GPUI 点击测试。

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| Bluesky 单图 `https://bsky.app/profile/bsky.app/post/3mzhhvhjfwk22` | Success，1/1，图片在根目录 | `coexistence.json` job 2，`cli-records/` |
| Bluesky 双图 `https://bsky.app/profile/mollieoreilly.bsky.social/post/3mz5die727k22` | Success，2/2，作品子目录；第二任务同名目录加 `(1)` | `coexistence.json` job 3 |
| Partial → 重试 | 真实两图下载后，测试 wrapper 人为返回一项及失败；job 1 / attempt 1 为 Partial 1/2，attempt 2 为 Success 2/2，原目录不变，原生 skip | `partial.json`、`retried.json`、`cli-records/` |
| 视频与图片共存 | 同一队列内上述图片任务及 `https://youtu.be/jNQXAC9IVRw` 全部 Success；真实 MKV 已验证，槽位释放 | `coexistence.json`、`stopped.json` |
| 真实下载中取消 | 进入 Gallery Downloading 后取消，Cancelled，active slots=0，资源释放，收尾小于 10 秒断言通过 | `cancelled.json` |
| Imgur 单图 `https://imgur.com/21yMxCS` | Success，1/1，根目录 `21yMxCS.png` | `imgur.json`、`cli-records/` |
| gallery-dl 官方获取 | 任务独有空缓存，经官方 HTTPS 获取、固定哈希校验及 native probe 成功；测试缓存自动清理 | `gallery-acquisition.json` |

Partial 网络验证是**真实下载 + 可复现的失败注入**，不是实际网站自然发生 HTTP 部分失败。未知总数、文件删除/修改、集合变化、取消后保留、不覆盖等异常边界由定向 Fixture / 单元测试覆盖。JPEG 的预检扩展名为 `jpeg`、实际完成为 `jpg` 是该固定 gallery-dl 原生映射，机器记录和真实产物一致。

真实产物仍在 `D:/Ameow/target/issue21-validation/output/`；原始 native 诊断在同级 `runtime/diagnostics/`。`output-manifest.json` 记录当前实际产物大小及 SHA-256，未向仓库复制媒体本体。`results.json` 中 `saved=0` 对视频仅表示没有 collection 字段，视频交付见原始 `delivered` 字段，不能解释为零产物。

## GPUI 与 #20 工具复用

新增 7 个场景：`compact.partial`、`full.partial`、`queue.partial`、`queue.partial-unknown`、`queue.partial-retry-pending`、`queue.gallery`、`queue.gallery-unknown`。定向运行真实 GPUI 并截图，未重跑全场景矩阵。PNG 均为窗口区域；同名 JSON 保留 PID/HWND、DPI、EXE 哈希和场景回执。

- `windows/queue.partial.png`：部分完成和已保存 4/5。
- `windows/queue.partial-unknown.png`：仅保存数量，没有虚构分母。
- `windows/queue.partial-retry-pending.png`：重试反馈。
- `windows/queue.gallery.png`、`queue.gallery-unknown.png`：下载文件数。
- `windows/full.partial-countfix.png`、`queue.partial-countfix.png`：最终 EXE 的 Full 与队列复核，含预览 Partial 异常计数修正。队列截图鼠标悬停重试时第二行按既有规则显示“重试”，数量请看未悬停的 `queue.partial.png`。
- `windows/compact.partial.png`：当前 Compact 产品形态，不宣称新增文字。
- `windows/components.ready.crop.png`：组件管理中的 gallery-dl；对外使用此裁剪版。
- `windows/partial-before-click.png`、`partial-after-click.png` 与 `native-retry.json`：真实 GPUI 点击 Partial 行重试，命令 `retry job 5`，accepted=true，原行转为等待下载，visible_rows 仍 `[5]`。后端是无网络隔离 Fixture；真实后端同 job 重试由前述网络测试证明。

最终开发程序：`target/debug/ameow.exe`，SHA-256 `C4191085B0C476F250DD067F20E743B0B39D268E42333FB2EF9752A5B1DE11CE`。较早截图的 EXE 哈希见各自 JSON；最后仅修正 Fixture 的 Partial 异常计数，未改变真实下载流程。#20 已验收开发程序保留在 `target/issue21-research/issue20-accepted-development.exe`，历史截图未覆盖。

## 检查结果与复现

- `cargo test --tests -- --test-threads=4`：288 passed、0 failed、16 ignored；完整日志 `tests-final.txt`。其中 4 个本轮真实测试另行显式运行成功，不能将全部 ignored 解释为未验证。
- 显式运行 `real_gallery_pipeline_and_partial_retry`（43.72s）、`real_gallery_cancel_releases_managed_processes`（17.31s）、`real_imgur_single_image_delivery`（28.92s）、`real_gallery_component_acquisition`（6.59s），均 PASS。
- 最终 Fixture 计数修改后，`cargo test --bin ameow preview::tests -- --test-threads=4`：4 passed、0 failed；`cargo build --bin ameow` 成功。完整下载测试证据继续复用。
- `cargo check --all-targets` 通过；`git diff --check` 通过。Impeccable 对受影响 UI 文件检测为 `[]`。
- 当前 Rust 1.93.0 工具链未安装 clippy，`cargo clippy --all-targets -- -D warnings` 无法执行，未标记 PASS。未安装额外组件或做全仓格式化。
- 独立只读审查已完成；取消后恢复解码耗时问题修复后复核无阻断；JPEG 扩展名疑点经固定版本源码与真实记录确认后撤回。审查者没有另跑网络或 GUI，实际运行证据由本报告区分提供。

```powershell
$env:AMEOW_GALLERY_TEST_ROOT = 'D:/Ameow/target/issue21-validation'
cargo test --lib real_gallery_pipeline_and_partial_retry -- --ignored --nocapture
cargo test --lib real_gallery_cancel_releases_managed_processes -- --ignored --nocapture
cargo test --lib real_imgur_single_image_delivery -- --ignored --nocapture
cargo test --lib real_gallery_component_acquisition -- --ignored --nocapture
./scripts/preview.ps1 -Scene queue.partial
```

已有证据应先复用；重新跑网络测试请使用新的任务自有目录，避免混淆本轮产物与后续结果。`source-manifest.json` 绑定本次修改源码与最终开发 EXE；`evidence-manifest.json` 记录本目录证据哈希。

## 运行时来源及限制

gallery-dl 固定 `1.32.19`，官方资产 `https://codeberg.org/mikf/gallery-dl/releases/download/v1.32.19/gallery-dl.exe`，22,627,366 bytes，SHA-256 `4DDA3F14EFBC8A8E616AF1FC7E1E88D795995326B47692453E620117254DEC18`。此哈希由官方 HTTPS 下载资产后计算；未找到独立官方 checksum/signature，不能声称已完成独立签名认证。standalone 需要 VC++ x86 redistributable，本机可运行。notice 已更新，本轮未打安装包。

standalone 内的 yt-dlp 委托依赖 Python 模块，无法直接等同于复用受管 `yt-dlp.exe`。本轮首批为图片，显式关闭 `extractor.ytdl.enabled` 和 `downloader.ytdl.enabled`，保留独立视频路径，不引入 Python/虚拟环境。

既有 FFmpeg 固定 URL `https://github.com/yt-dlp/FFmpeg-Builds/releases/download/autobuild-2026-10-09-19-22/ffmpeg-N-127264-gf5d4fd186c-win64-gpl.zip` 本次返回 HTTP 404。扩展 runtime manifest 后，原逻辑会重新获取整套组件，首次 Imgur 验证因此在 Preparing 超时。现已局部修正：常规 catalog 扩展也优先按**新 manifest 固定哈希**复用旧缓存组件，在新 stage 进行 probe，再发布新目录，旧缓存保留；回归 `catalog_extension_reuses_hash_verified_components_before_acquisition` 通过，随后 Imgur 成功。**完全没有可用 FFmpeg 缓存的冷启动仍受原地址 404 限制**；本轮未擅自更换 FFmpeg 版本或下载源。gallery-dl 自身空缓存获取已单独实测成功。

未验证：Imgur 相册真实网络下载、本轮 Bilibili 真实重下、真实站点跨引擎回退、跨 attempt `.part` 续传、macOS、混合 DPI。Bilibili 文章、Cookie/登录、主页/频道/流、浏览器扩展不在首批范围。

GitHub 回写包含自包含的文本结果与证据索引；网页 GPT 可按用户现有方式读取本地报告和截图路径。Issue 保持 Open，等待网页 GPT 验收。
