# #20 Windows 原生预览验证（2026-11-04）

状态：用户已验收通过，并授权仅提交 #20 的已验收内容，记录完整 Commit SHA 后关闭 Issue、将 Project 更新为 Done。最终结案提交与状态见 [#20](https://github.com/Wutpeach/Ameow/issues/20)。本目录保留各阶段验证时的基线和限制；历史“未提交 / 等待验收”描述指当时状态。

最新交互为[单击确认与返回/退出按钮](single-click/README.md)：保留两级目录，鼠标悬停高亮、单击确认，顶部按钮可返回或退出；键盘与滚轮仍可使用。756 个场景/尺寸组合与 Windows Terminal 原生操作通过。上一版[双击确认键鼠菜单](keyboard-mouse/README.md)、历史[两级数字目录](two-level-menu/README.md)和[平铺分页排版](terminal-layout/README.md)证据保留供追溯。

## 实际结果

- 单一场景目录：84 项；同一 Windows GPUI 进程逐项确认回执并保存 84 张真实窗口 PNG，另有 3 张延迟截图，共 87 张。
- Windows 终端：help、编号、命名切换、未知输入、q 退出均通过；命名直达和截图后退出通过；缺 EXE、未知场景有明确报错。
- 控制通道拒绝未知场景且保留旧状态；退出本轮实例后，另一个预览实例仍运行。
- 全场景运行前后对真实 LOCALAPPDATA/AmeowNext/stage-a 下文件内容做哈希比较，未变；系统剪贴板序号未变。
- 诊断复制成功反馈保持超过 2 秒、队列 Success 行保持超过 500ms，托盘在终端控制期间保持可见；实际延迟截图可见下方链接。
- cargo test --bin ameow -- --test-threads=4：155 passed、0 failed、1 ignored（既有 Windows native 字体测试）。
- cargo build --bin ameow 与 git diff --check 通过。定向回归包括 Windows 并发原子替换控制文件、未知场景、真实命令拒绝、终态和反馈保持、托盘状态摘要。
- 独立只读审查复核隔离入口，未发现剩余阻断。
- 最后增加窗口打开失败回执和初始化等待、菜单失焦保持、独立控制参数保护；重新编译后定向直达/截图成功。完整场景图沿用前一构建的真实证据，呈现逻辑相同，两个 EXE 哈希分别列出。
- 可选的原生“点击菜单退出”未执行：桌面工具返回 USER_INPUT_ACTIVE，点击未发送，已停止该检查并清理自建实例。终端 q 和控制 Quit 已实测。

## 版本与原始记录

- 完整运行 EXE SHA-256：53b590c2e8581d2f659eb14a5aea3f57a24926305935bb86971e76106cdb6e2c
- 最终开发 EXE SHA-256：a691c0e61cb3c0a71f7192c78d9889a7c12f3fd45536589e1fe2b5cfd2976cee
- 最终定向截图 DPI：96；Windows x64/MSVC；macOS、混合 DPI、真实下载与系统操作成功不在本轮证明范围。
- [完整运行验证 JSON](windows-complete/validation.json)、[终端菜单实录](windows-complete/terminal-menu.txt)。
- 每张 PNG 的同名 JSON 包含场景、PID/HWND、窗口标题、边界、DPI、EXE 哈希、HEAD/dirty、截图时间与控制回执。
- GitHub 图片附件没有上传：当前 MCP 没有附件工具，专用浏览器未登录。Issue 报告如实记录本地证据；本目录链接供本地验收查看，不是网页可访问附件。

## 代表性证据

- [最终诊断复制失败](final-proof/diagnostics.copy-failed.png)
- [组件恢复需求](windows-complete/components.recovery-required.png)
- [组件更新确认](windows-complete/components.update-confirm.png)
- [设置保存中/禁用](windows-complete/settings.saving.png)
- [Full 多任务与失败 Badge](windows-complete/full.badge.png)
- [最终托盘混合](final-smoke/tray.mixed.png)
- [最终 Full 菜单](final-smoke/menu.root.png)
- [诊断反馈延迟 3.2 秒](windows-complete/hold-diagnostics-copied.png)
- [Success 延迟 2 秒](windows-complete/hold-queue-success.png)

## 覆盖清单

| 分组 | 数量 |
| --- | ---: |
| compact | 10 |
| full | 10 |
| queue | 19 |
| settings | 18 |
| components | 13 |
| diagnostics | 5 |
| tray | 7 |
| menu | 1 |
| overlay | 1 |

| 场景 | 真实呈现 | PNG |
| --- | --- | --- |
| compact.idle | 空闲 | [查看](windows-complete/compact.idle.png) |
| compact.resolving | 解析视频 | [查看](windows-complete/compact.resolving.png) |
| compact.downloading | 已知进度下载 | [查看](windows-complete/compact.downloading.png) |
| compact.unknown | 未知进度下载 | [查看](windows-complete/compact.unknown.png) |
| compact.audio | 音频下载阶段 | [查看](windows-complete/compact.audio.png) |
| compact.merging | 合并媒体 | [查看](windows-complete/compact.merging.png) |
| compact.success | 下载成功 | [查看](windows-complete/compact.success.png) |
| compact.failure | 下载失败及失败 Badge | [查看](windows-complete/compact.failure.png) |
| compact.cancelled | 已取消 | [查看](windows-complete/compact.cancelled.png) |
| compact.badge | 多任务与失败数据（Compact 隐藏 Badge） | [查看](windows-complete/compact.badge.png) |
| full.idle | Full 空闲 | [查看](windows-complete/full.idle.png) |
| full.downloading | Full 已知进度 | [查看](windows-complete/full.downloading.png) |
| full.success | Full 成功反馈 | [查看](windows-complete/full.success.png) |
| full.failure | Full 失败反馈 | [查看](windows-complete/full.failure.png) |
| full.cancelled | Full 取消反馈 | [查看](windows-complete/full.cancelled.png) |
| full.resolving | Full 解析中 | [查看](windows-complete/full.resolving.png) |
| full.unknown | Full 未知进度 | [查看](windows-complete/full.unknown.png) |
| full.audio | Full 音频阶段 | [查看](windows-complete/full.audio.png) |
| full.merging | Full 合并阶段 | [查看](windows-complete/full.merging.png) |
| full.badge | Full 多任务和失败 Badge | [查看](windows-complete/full.badge.png) |
| queue.empty | 空队列 | [查看](windows-complete/queue.empty.png) |
| queue.queued | 单任务等待 | [查看](windows-complete/queue.queued.png) |
| queue.resolving | 单任务解析 | [查看](windows-complete/queue.resolving.png) |
| queue.downloading | 已知进度与速度 | [查看](windows-complete/queue.downloading.png) |
| queue.unknown | 未知进度 | [查看](windows-complete/queue.unknown.png) |
| queue.audio | 音频阶段 | [查看](windows-complete/queue.audio.png) |
| queue.merging | 媒体合并 | [查看](windows-complete/queue.merging.png) |
| queue.validating | 校验媒体 | [查看](windows-complete/queue.validating.png) |
| queue.publishing | 保存文件 | [查看](windows-complete/queue.publishing.png) |
| queue.success | 保持成功行 | [查看](windows-complete/queue.success.png) |
| queue.failure | 失败行及三个操作 | [查看](windows-complete/queue.failure.png) |
| queue.concurrent | 三并发与排队 | [查看](windows-complete/queue.concurrent.png) |
| queue.mixed | 下载、排队和失败 | [查看](windows-complete/queue.mixed.png) |
| queue.long-title | 长标题及窄标题区域 | [查看](windows-complete/queue.long-title.png) |
| queue.held | 清理未确认 | [查看](windows-complete/queue.held.png) |
| queue.retry-pending | 重试处理中 | [查看](windows-complete/queue.retry-pending.png) |
| queue.retry-refused | 重试未受理反馈 | [查看](windows-complete/queue.retry-refused.png) |
| queue.copied | 诊断已复制反馈 | [查看](windows-complete/queue.copied.png) |
| queue.copy-failed | 诊断复制失败反馈 | [查看](windows-complete/queue.copy-failed.png) |
| settings.general | 常规页面与主要选项 | [查看](windows-complete/settings.general.png) |
| settings.download | 下载页面与主要选项 | [查看](windows-complete/settings.download.png) |
| settings.saving | 保存中及禁用控件 | [查看](windows-complete/settings.saving.png) |
| settings.saved | 保存后已确认的设置 | [查看](windows-complete/settings.saved.png) |
| settings.save-failed | 保存失败 | [查看](windows-complete/settings.save-failed.png) |
| settings.unavailable | 设置尚未就绪 | [查看](windows-complete/settings.unavailable.png) |
| settings.path-unavailable | 目录不存在 | [查看](windows-complete/settings.path-unavailable.png) |
| settings.path-denied | 目录无法访问 | [查看](windows-complete/settings.path-denied.png) |
| settings.path-copied | 完整路径已复制反馈 | [查看](windows-complete/settings.path-copied.png) |
| settings.path-copy-failed | 路径复制失败反馈 | [查看](windows-complete/settings.path-copy-failed.png) |
| settings.open-failed | 打开目录失败 | [查看](windows-complete/settings.open-failed.png) |
| settings.picker-cancelled | 未选择文件夹 | [查看](windows-complete/settings.picker-cancelled.png) |
| settings.theme-menu | 常规：主题选项 | [查看](windows-complete/settings.theme-menu.png) |
| settings.language-menu | 常规：语言选项 | [查看](windows-complete/settings.language-menu.png) |
| settings.tray-menu | 常规：托盘图标选项 | [查看](windows-complete/settings.tray-menu.png) |
| settings.startup-enabled | 开机启动已启用 | [查看](windows-complete/settings.startup-enabled.png) |
| settings.startup-unavailable | 开机启动状态不可用 | [查看](windows-complete/settings.startup-unavailable.png) |
| settings.startup-pending | 开机启动读取中 | [查看](windows-complete/settings.startup-pending.png) |
| components.ready | 组件版本与就绪 | [查看](windows-complete/components.ready.png) |
| components.missing | 组件尚未准备 | [查看](windows-complete/components.missing.png) |
| components.preparing | 组件准备中 | [查看](windows-complete/components.preparing.png) |
| components.checking | 检查更新中 | [查看](windows-complete/components.checking.png) |
| components.check-failed | 检查更新失败 | [查看](windows-complete/components.check-failed.png) |
| components.update-available | 可更新版本 | [查看](windows-complete/components.update-available.png) |
| components.update-confirm | 更新确认层 | [查看](windows-complete/components.update-confirm.png) |
| components.updating | 组件更新中 | [查看](windows-complete/components.updating.png) |
| components.update-waiting | 等待当前任务结束 | [查看](windows-complete/components.update-waiting.png) |
| components.update-failed | 更新失败 | [查看](windows-complete/components.update-failed.png) |
| components.restored | 已恢复推荐版本 | [查看](windows-complete/components.restored.png) |
| components.recovery-required | 需要恢复组件 | [查看](windows-complete/components.recovery-required.png) |
| components.owner-lost | 组件清理未确认 | [查看](windows-complete/components.owner-lost.png) |
| diagnostics.ready | 诊断可复制 | [查看](windows-complete/diagnostics.ready.png) |
| diagnostics.copying | 诊断复制中 | [查看](windows-complete/diagnostics.copying.png) |
| diagnostics.copied | 诊断复制成功反馈 | [查看](windows-complete/diagnostics.copied.png) |
| diagnostics.copy-failed | 诊断复制失败反馈 | [查看](windows-complete/diagnostics.copy-failed.png) |
| diagnostics.unavailable | 诊断不可用 | [查看](windows-complete/diagnostics.unavailable.png) |
| tray.idle | 托盘弹窗空闲 | [查看](windows-complete/tray.idle.png) |
| tray.downloading | 托盘弹窗下载中 | [查看](windows-complete/tray.downloading.png) |
| tray.mixed | 托盘下载、排队和失败 | [查看](windows-complete/tray.mixed.png) |
| tray.preparing | 托盘准备组件 | [查看](windows-complete/tray.preparing.png) |
| tray.cleanup-unknown | 托盘清理未确认 | [查看](windows-complete/tray.cleanup-unknown.png) |
| tray.startup-failed | 托盘启动失败 | [查看](windows-complete/tray.startup-failed.png) |
| tray.stopping | 托盘正在停止 | [查看](windows-complete/tray.stopping.png) |
| menu.root | Full 右键菜单 | [查看](windows-complete/menu.root.png) |
| overlay.exit-confirm | 正在下载时退出确认 | [查看](windows-complete/overlay.exit-confirm.png) |

## 界限与未覆盖项

Compact 仍按当前产品折叠渲染隐藏进度、状态文字和 Badge；表中的 Compact 状态指底层真实模型状态，不表示 10 种不同外观。可见环、文案和 Badge 请看对应 Full 场景。设置保存成功没有产品成功文案，预览没有新增提示。

未做主题 × 语言 × DPI × 任务数全排列；未逐项展开全部网络错误、组件每一个下载/验证阶段、更新检查冷却/超时、原生 picker/系统权限流程及任意连续交互。它们是相同呈现分支的参数变化，或需要真实原生操作证明；本轮保持局部注入，没有为极端场景重构业务。

上述截图证明真实 Windows GPUI 组件绘制了合成状态，不替代真实网络下载、组件更新、持久设置、系统剪贴板、Windows 通知区域、开机启动或跨屏行为验收。

启动方式与新增场景规则见 [使用说明](../../preview.md)。AGENTS.md 已在基本能力验证通过后追加长期维护规则。
