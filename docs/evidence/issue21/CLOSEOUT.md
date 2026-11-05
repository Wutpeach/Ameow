# #21 验收与结案索引

2026-11-05，网页 GPT 独立复验 **PASS**：https://github.com/Wutpeach/Ameow/issues/21#issuecomment-6650745021 。用户已授权仅对 #21 验收范围执行本地提交和 Issue / Project 结案；不 push、merge、发布或启动后续任务。

## 最终交付

- 独立受管 gallery-dl 1.32.19、自动路由、同任务多文件交付、作品目录和不覆盖保护。
- Partial 状态、已保存数量、原 job / 原目录重试、原生 skip、取消收尾及必要的 GPUI 预览场景。
- FFmpeg 固定 Gyan 9.0.2 资产，归档与内部文件摘要、路径和版本探针均核实；无缓存 HTTP 404 阻断已解除，保留原校验和缓存复用机制。

开发记录保留为各自检查点，不改写历史内容：

- [首轮开发与 Windows 证据](README.md)，GitHub 报告 https://github.com/Wutpeach/Ameow/issues/21#issuecomment-6636869383 。
- [FFmpeg 冷启动修复与定向验证](ffmpeg-cold-repair/README.md)，GitHub 补充报告 https://github.com/Wutpeach/Ameow/issues/21#issuecomment-6649180866 。
- 最终源码及 EXE 身份：[source-after.json](ffmpeg-cold-repair/source-after.json)。本地提交前核对 33 项源码/配置文件的大小和 SHA-256，全部一致；开发 EXE SHA-256 为 `E29803671FD910172C8D8F9CDCCE00501D291B871E4A11B2040B1D005761BD81`。
- 两份原证据清单：[首轮清单](evidence-manifest.json)、[修复清单](ffmpeg-cold-repair/evidence-manifest.json)。72 个既有证据文件全部能由清单对应，大小与摘要核对通过。

## 提交边界与验证复用

提交包含已验收的 33 项源码/组件配置/说明、72 份既有证据、本结案索引和证据目录内的 `.gitattributes`。该属性仅禁止本目录证据换行自动转换，以保留记录的原始摘要；上游文本和测试日志保留原始空白。源码包括新增 gallery adapter、最小自动路由、图片验证及集合测试，和必要的队列、交付、运行时、UI/预览接入。证据总量约 0.8 MB，仅含报告、摘要/结构化记录、测试日志和原生窗口截图；不包含工具 EXE、媒体本体或安装包。

保留原有 `.ameow-docs-reviewed-sha`、`.ameow-docs-reviewed-state.json`、`.trellis/tasks/`、`docs/evidence/issue20/issue-comment.md`、`docs/evidence/issue20/quick-paging/`、`scripts/schedule-checks/` 及 target 下的历史 EXE/媒体。结案不改变 #20 历史证据和其他任务内容。

复用首轮 288 passed / 0 failed、4 项显式真实 Windows 测试、7 个新增场景和 GPUI 重试点击证据，以及修复轮 10 项定向测试、真实空应用缓存获取、图片与含音轨视频的交付/解码记录。本次只核对文件身份、提交清单和 Git 差异，不重跑完整测试或原生矩阵。完整 Commit SHA 和 Closed / Project Done 的操作回执以 #21 最终结案评论为准。

## 保留限制

真实网站跨引擎回退没有已证明等价的独立候选，运行路径不启用，保留准入/拒绝测试。Imgur 相册真实网络、跨 attempt `.part` 续传、本轮 Bilibili 真实重下、macOS/混合 DPI 和 clippy 未验证/未运行。Partial 网络证据是实际下载后注入可复现失败；GPUI 点击证据后端是隔离 Fixture。冷启动验证针对现有 Windows 机器上的空应用缓存，并非全新系统/安装器验收；首次未分类网络失败和第二个全新空目录的成功均如实保留。以上已获独立验收认可为本轮非阻断限制，不扩大支持声明。
