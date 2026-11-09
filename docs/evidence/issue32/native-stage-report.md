# #32 本地提交与定向原生验收（2026-11-09）

本阶段从既有迁移 Worktree 继续，未重新迁移或重跑 94×2。当前结论为**阶段部分完成，尚不具备最终合并条件**。真实输入已补到 Gallery 与设置保存失败恢复；设置全操作和实际 Shell 托盘点击仍未完成。

## 本地提交

- 分支：`feature/gpui-kit-migration`；Worktree：`D:/Ameow-gpui-kit`。
- 已提交上一阶段验收成果：`11fc718dae33cc6960d21923a4da4c9fc17564d6`。
- 提交标题：`feat(ui): finish Gallery cancellation and preview tool consolidation (#32)`。
- 20 个文件：Gallery 取消/恢复、旧预览入口清理、覆盖文档与兼容性测试/证据；提交后工作区干净。提交前 7 项无窗口 Gallery 工具测试与差异空白检查通过。
- 提交之后新增的测试宿主、测试隔离保护与本报告**尚未提交**，不属于 `11fc718d`；没有新的产品运行时 UI 状态，Preview Scenes 无需扩充。
- 本轮没有 Push、合并 main、清理 Worktree、发布或关闭 Issue。

## 本轮实际桌面证据

用户另行同意本轮 5–8 分钟、最多 10 张截图的范围后执行。实际窗口占用约 384 秒，保留 6 张原生窗口截图；仅使用 Cindy computer 前台 `global_input` / Windows `SendInput` 作为鼠标、键盘输入，未以 PostMessage 或托盘回调替代。途中 `STALE_SNAPSHOT` 及一次缺少截图上下文的拒绝均未计为成功；重新读取窗口后才继续。

| 项目 | 实际结果 | 证据与限制 |
| --- | --- | --- |
| Gallery 鼠标主题选择 | 通过 | 点击深色，收到 `compact.idle` / night=true / step=2 的真实子进程 ACK。 |
| Gallery 正向焦点及 Enter | 通过 | 从深色控件 `Tab → Enter`，生成唯一 `dark-compact.idle-1.png` 与匹配 PID=59200 的原生回执。 |
| Gallery 反向焦点及 Space | 通过 | 从截图控件 `Shift+Tab → Space` 返回并激活深色，ACK 升至 step=3。仅证明这段焦点路径，不代表全部分类/长列表遍历。 |
| 设置真实窗口成功保存 | 通过 | 鼠标打开主题下拉，Down/Enter 选择深色；真实 QueueCommand → coordinator → 磁盘 → SettingsSaved → 窗口主题生效。 |
| 设置保存失败 | 通过 | 仅在任务目录将 settings.json 临时替换为空目录，选择浅色后收到 E_SETTINGS_SAVE；UI 保留已确认深色，显示失败提示，pending 已解除。 |
| 设置恢复与直接重试 | 通过 | 恢复原文件后再次 Up/Enter 选择浅色成功；磁盘 JSON 与 UI ACK 完全一致，质量与目录保持原值。 |
| 设置关闭 | 通过 | Alt+F4 关闭设置窗口，进程仍可继续；完整关闭/重开链尚未完成。 |
| 托盘注册与退出清理 | 通过 | Shell 注册了本轮测试图标；进程退出后 Shell_NotifyIconGetRect 返回失败，图标已移除。 |
| Shell 实际点击、弹窗与入口 | 未验证 | 只读定位得到真实 Shell_TrayWnd=133072，但 Cindy computer 的 list_windows 未枚举任务栏，get_window_state 返回 tool_invocation_failed / No window with window_id 133072 exists；未向任何托盘图标发送点击。 |

设置宿主只存在于 `cfg(test)` 的 ignored test，不增加产品 CLI。它避开生产单实例入口，在独立目录使用实际设置 coordinator；故意提供损坏的测试 runtime-selection.json，复用已存在的 fail-closed 边界阻止组件准备，命令白名单拒绝下载和运行时更新。用户启动项读写被测试保护阻断；实际命令日志只有 3 次设置请求与 Stop，上游检查始终 idle。后续为该测试宿主补充了拒绝直接上游检查的保护及无窗口测试；这次加固未再次开窗口。

运行时 EXE 身份：

- Gallery：`860efe4d81045d7c16ab647eb8b8adbf872a66eca562c2244f76c5ac90a18e84`，复用冻结 `gallery-controls-after-checks.exe`。截图元数据中的 source_head 是截图时 checkout，不能替代 EXE 身份。
- 设置宿主：`820c8613ff184366be9016ed82bc87c7a950d7f19a2396254ab8d42994942638`，冻结于 `evidence/issue32/physical-native-1/settings-tray-host.exe`；它是 `11fc718d` 加本轮初版 test-only 宿主的编译产物。后续测试加固版本只做无窗口检查，不声称已重新完成原生验收。

原始本机证据目录：`evidence/issue32/physical-native-1/`，含 run.json、输入工具回执、命令日志、成功/失败/恢复状态与截图。其文件未覆盖旧验收资产。精简可读证据：[native-validation.json](native-validation.json)、[Gallery 焦点局部](native-gallery-focus.png)、[设置保存失败](native-settings-failure.png)、[恢复成功](native-settings-recovered.png)。

## 无窗口检查与复用

- `cargo test --locked settings`：24 项通过，1 项桌面宿主保持 ignored；未因此启动新窗口。
- 新 transport 用例单独通过：真实保存/ACK、磁盘一致、禁止上游检查、拒绝下载、Stop 收敛。
- `cargo check --locked --bin ameow` 与 CRLF 感知的 `git diff --check` 通过。
- 桌面宿主测试进程正常退出的 `1 passed` 只证明宿主退出，不能解释为托盘/设置全部流程通过。
- 复用上一阶段分类截图 2/2、完整批次 1/188 后取消、关闭批次 0/188、截图失败重试、预览退出恢复、动画 122/122 应用帧和设置服务重建读回证据。
- 测试进程与子进程全部退出；用户 AmeowNext 启动注册值前后相同。主线正在运行的自动更新实例保持独立。

## 未完成项与下一步

1. Gallery 全分类键盘/滚动遍历、长列表焦点可见性；本轮只补齐主题与截图路径的真实输入。
2. 设置语言、托盘图标、质量、目录选择/取消/复制与完整重开流程的真实窗口验收；用户启动项需要单独安全安排。已有逻辑/服务证据继续有效，不升级为完整 UI 通过。
3. 实际 Shell 点击后的弹窗开关及设置、显示、退出入口；需要支持任务栏定位的输入工具或人工定向验收。本轮工具阻碍不作为 Ameow 产品故障。
4. 混合 DPI/跨屏依用户要求留最终验收；本轮 Gallery 原生回执仍为 96 DPI。合成呈现节奏未测。
5. main 复核仍 `4d57d3a70889b739cada6efc2040a1f91b6ef67e`，自动更新仍有未提交开发成果，无稳定新增提交可整合。未复制 main dirty 文件；待稳定提交后再 main → 迁移分支并进行更新/重启联合回归。

本轮停止桌面操作并提交阶段报告，等待网页侧决定剩余定向验收安排；不是最终迁移完成或合并申请。
