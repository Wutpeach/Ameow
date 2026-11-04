# 正式键鼠预览菜单（2026-11-04）

这是上一版双击确认的历史记录；当前交互按用户要求改为[单击确认与返回/退出按钮](../single-click/README.md)。

已接入 `scripts/preview.ps1`，替代交互终端的数字输入框；main 未提交工作区，HEAD `cf49e60e1912f92b08e3fe65177626b7dc02d87f`。停止等待网页 GPT 验收，Issue 保持 Open。

## 操作与实现范围

- 先选界面分类，再选该界面状态；↑/↓ 移动，←/→、PageUp/PageDown 或滚轮翻页，Home/End 定位首尾。
- 悬停、单击只改变高亮；Enter 或双击才确认。Esc/b 返回分类，h 帮助，q/Ctrl+C 退出。浏览分类和页面不切换真实预览。
- 顶部固定显示操作提示、当前场景、最近结果；按终端尺寸分页，窄窗口状态名与说明分两行。
- 复用同一 EXE、场景目录、隔离实例和控制回执。仅增加 PowerShell 加载的本地 C# Win32 输入桥，没有新增第三方包依赖，本次接入未修改 Rust 或重新构建 EXE。
- 非交互的重定向输入/输出保留编号与文本命令；`-Scene`、`-Capture`、`-List` 保留。
- 退出恢复终端备用屏幕、输入/输出模式和光标；只关闭本轮进程、删除本轮 GUID 临时目录。

## 本次验证

| 检查 | 实际结果 / 证据 |
| --- | --- |
| 菜单回归 | [756 个场景/尺寸组合](menu-tests.txt)通过，另覆盖键盘边界、分页回环、鼠标两行命中、列表外忽略、文本回退和 Win32 输入结构/按键转换 |
| 分类导航 | Windows Terminal 用 ↓、Enter 进入下载队列；仅浏览时回执 step 仍为 1 |
| 翻页 | ← 到第 1 页；滚轮向下到第 2 页，当前场景仍为 queue.mixed；[实际截图](03-wheel-page.png) |
| 单击选择 | 单击 queue.copy-failed 产生高亮，[截图](04-focus-only.png)；[回执](focus-only.json)仍为 step 1 / queue.mixed |
| 双击确认 | [截图](05-confirmed.png)与[回执](double-click.json)：同一 PID 75808，step 2 / queue.copy-failed |
| 返回、跨分类、Enter | Esc 回分类，双击诊断，单击失败状态，Enter 后[回执](enter.json)为同 PID、step 3 / diagnostics.copy-failed；[菜单截图](06-enter-diagnostics.png) |
| 窄窗口鼠标命中 | [两行布局](07-narrow.png)，单击 queue.failure 的第二行说明，高亮整个项目；当前场景仍为 queue.mixed |
| 调整尺寸 | 从 635×562 原生窗口最大化为 2560×1400，再还原；焦点保持 queue.failure，分页和单/双行布局随尺寸重算；[放大后](08-resized-wide.png)、[还原后](09-restored-narrow.png) |
| q / Ctrl+C | 两轮真实退出均恢复 input/output mode 503,7 → 503,7：[q](restored.json)、[Ctrl+C](restored-narrow.json) |
| 隔离清理 | q 后本轮 PID 75808 退出、GUID 临时目录删除，原预览 PID 100440 保持运行；[记录](cleanup.json) |
| 重定向兼容 | [实际脚本日志](redirected.txt)：3 → n → p → 19 → b → diagnostics.copied → help → q；场景 queue.mixed → queue.copy-failed → diagnostics.copied 来自同一 PID 87320 |
| CLI | `-Scene components.recovery-required -Capture ...` 成功生成 PNG/JSON 后退出；`-List` 导出[84 项目录](catalog.txt) |
| 工作区检查 | `git diff --check` 通过；既有 src/download_ui.rs 的 CRLF 提示保留 |

悬停的 Windows 持续鼠标移动事件在前一轮已通过 Demo 原始事件确认；正式输入桥保留相同的持续移动开关，移动事件与单击共用同一个菜单命中和焦点路径。本次正式入口完成了单击、双击、滚轮、键盘与尺寸调整实测，没有独立重新采集纯悬停事件日志。

## 原生 UI 截图与版本

- [通过正式菜单 Enter 切换后的诊断复制失败](diagnostics.copy-failed.png)，[同名 JSON](diagnostics.copy-failed.json)含 step 3 / PID 75808 的真实回执。
- [命名直达并自动截图的组件恢复需求](components.recovery-required.png)，[同名 JSON](components.recovery-required.json)。
- 本次复用的开发 EXE SHA-256：`bdc65820886b0d858c368b6f9917dfacbf39aeb09505c7314a563cc58f5f3571`。历史证据记录各自构建哈希，不以本次哈希覆盖。
- 截图为实际 Windows Terminal / GPUI 窗口裁剪；部分终端画面旁可见旧预览窗口或工具光标。主窗口实际截图另有独立 PNG。
- 完整 84 场景呈现沿用父目录原有证据，本轮只验证受影响的终端交互与少量原生切换。Windows Terminal 为本次验证宿主，其他终端、macOS、混合 DPI 未验证。
- 证据保存在本地仓库；GitHub MCP 不支持图片附件上传，这些路径不是网页附件。
