**#32 阶段报告｜本地提交与剩余兼容性定向验收｜2026-11-09**

本阶段从现有 `D:/Ameow-gpui-kit` 继续。结论：**上一阶段成果已本地提交；本轮补齐部分真实输入与设置失败恢复证据，剩余原生验收尚未全部完成，不具备最终合并条件。**

**本地提交**

- 分支：`feature/gpui-kit-migration`。
- Commit：`11fc718dae33cc6960d21923a4da4c9fc17564d6`。
- 标题：`feat(ui): finish Gallery cancellation and preview tool consolidation (#32)`。
- 20 个文件，涵盖已验收的 Gallery 取消/恢复、旧工具清理和兼容性测试/证据。提交前核对了差异与文件范围，7 项无窗口 Gallery 工具检查及空白检查通过；提交后 Worktree 干净。
- 提交后新增的 `cfg(test)` 原生设置宿主、隔离保护和本轮报告/证据仍未提交，不属于上述 SHA；没有新增产品 UI 状态。

**本轮实际验收**

取得本轮 5–8 分钟、最多 10 张截图的明确同意后执行。实际约 **6 分 24 秒，保留 6 张窗口截图**，未运行 94×2。真实输入通过 Cindy computer 前台 `global_input` / Windows `SendInput`，未用 PostMessage 或托盘回调代替。

| 范围 | 结果与证据边界 |
| --- | --- |
| Gallery 鼠标主题选择 | 点击深色后收到 `compact.idle` / night=true / step=2 的真实预览 ACK。 |
| Gallery 键盘与焦点 | `Tab → Enter` 生成单张 PNG 和匹配 PID=59200 的原生回执；`Shift+Tab → Space` 返回深色控件并令 ACK 升到 step=3。仅证明这段路径。 |
| 设置成功保存 | 实际设置窗口鼠标打开下拉、Down/Enter 选择深色，真实 QueueCommand → coordinator → 磁盘 → SettingsSaved → 窗口生效。 |
| 设置保存失败与恢复 | 仅在测试目录临时阻断 settings.json 替换，选择浅色后显示 E_SETTINGS_SAVE，UI 保留深色且解除 pending；恢复文件后直接重试成功，浅色 ACK 与磁盘一致，质量与目录未变。 |
| 设置关闭 | Alt+F4 关闭窗口通过；完整重开及其他操作尚未验完。 |
| 托盘注册与清理 | Shell 注册了测试图标；测试进程退出后确认图标已移除。 |
| 托盘实际点击、弹窗及入口 | **未验证**。当前桌面工具未枚举真实 Shell_TrayWnd，读取实际 HWND=133072 返回 `tool_invocation_failed / No window with window_id 133072 exists`，未向任何图标发送点击。这是工具限制，未归因于产品故障。 |

设置宿主仅编入 ignored test，避开生产单实例，使用任务目录中的真实设置服务。损坏的测试 runtime-selection.json 触发现有 fail-closed 边界以阻止组件准备，命令白名单拒绝下载/运行时更新，测试 UI 阻断用户启动项读写。实际日志只有 3 次设置请求与 Stop，上游检查始终 idle。后续补充了禁止该宿主直接检查上游的保护，只做无窗口检查，未再次启动桌面。

测试窗口/子进程均已退出；用户 AmeowNext 启动注册值前后相同。未干扰 main 正在运行的自动更新实例。途中被拒绝的过期窗口快照/缺少截图上下文操作未计为通过。

**检查和证据**

- `cargo test --locked settings`：**24 项通过，1 项桌面宿主保持 ignored**；新 transport 用例另行定向通过，覆盖真实保存/ACK、磁盘一致、禁止上游、拒绝下载与 Stop。
- `cargo check --locked --bin ameow` 和 CRLF 感知的差异检查通过。宿主进程的 `1 passed` 仅证明宿主运行/退出，不代表全部设置和托盘流程通过。
- 复用旧分类 2/2、完整批次 1/188 后取消、关闭批次 0/188、截图异常恢复、动画应用帧及设置服务重建读回证据。
- Gallery 实测 EXE SHA-256：`860efe4d81045d7c16ab647eb8b8adbf872a66eca562c2244f76c5ac90a18e84`。
- 设置实测宿主 SHA-256：`820c8613ff184366be9016ed82bc87c7a950d7f19a2396254ab8d42994942638`。后续加固版本仅经过无窗口检查，二者未混同。
- 完整本地报告：`D:/Ameow-gpui-kit/docs/evidence/issue32/native-stage-report.md`。
- 精简机器证据：`D:/Ameow-gpui-kit/docs/evidence/issue32/native-validation.json`。
- 局部截图：同目录 `native-gallery-focus.png`、`native-settings-failure.png`、`native-settings-recovered.png`。
- 原始日志、输入工具回执、状态快照、冻结 EXE 和 6 张截图：`D:/Ameow-gpui-kit/evidence/issue32/physical-native-1/`。旧验收产物保持保留。

**未完成与决策需求**

1. Gallery 全分类键盘/滚动及长列表焦点可见性；设置语言、托盘图标、质量、目录选择/取消/复制、完整重开和启动项操作的真实窗口验收。已有逻辑/服务证据不升级为完整 UI 通过。
2. 实际 Shell 点击后的弹窗开关与设置/显示/退出入口，需要支持任务栏定位的输入工具或人工定向验收。
3. 混合 DPI/跨屏按要求留最终验收；本轮 Gallery 原生回执为 96 DPI，合成呈现节奏仍未验证。
4. main 仍为 `4d57d3a70889b739cada6efc2040a1f91b6ef67e`，自动更新尚无稳定新增提交；未复制 dirty 文件或整合。待稳定提交后再 main → 迁移分支，并做更新/重启联合回归。

本轮仅本地提交，未 Push、合并 main、清理 Worktree、发布或关闭 #32。当前停止桌面操作，等待网页侧阶段验收与剩余定向验收安排；未启动最终合并收尾。
