# #32 动效回归排查阶段报告 · 2026-11-09

对应[开发指令 6733737792](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6733737792)。从 `D:/Ameow-gpui-kit` / `feature/gpui-kit-migration` 的干净 `d135f85164ca1b9ea05a0a53bbd99b9c855b9153` 继续。

**结论：本轮普通模式未复现 Compact → Full 动效丢失。用户实际操作确认当前版过渡流畅，原生桌面录像也显示展开、收起和中途反向。确认并修正了设置/托盘测试宿主强制 Reduced Motion 的差异；此前故障实例的 EXE/参数身份不明，因此不能断言历史反馈的唯一根因已经查明。没有修改产品动画模型、参数或 GPUI 引擎。**

本阶段本地提交的完整 SHA 见对应 GitHub 阶段报告；本文和机器证据记录验收时的源码基线及二进制身份，不把后来的报告提交冒充运行构建来源。

## 四层排查

| 层次 | 证据与结论 |
| --- | --- |
| 动画模型 | 对比迁移前 `4d57d3a7`，`src/model.rs`、`src/repair_motion.rs` 完全相同，既定 Converged/A-soft spring `(520,40)`、目标移交、速度连续及 Reduced Motion 路径保留。第一轮实测 1,695 个应用帧、1,037 个中间 fullness；61.259 秒反向收起时仍保留正速度，61.353 秒反向展开时仍保留负速度。数据支持连续移交，不能单独证明屏幕平滑度。 |
| GPUI 调度 | moving 仍通过 `next_wake_ms` 请求 16 ms 动画帧。GPUI 0.3.11 当前默认非活动窗口最小间隔 33,333 μs；旧兼容证据中位应用帧间隔为 33.353 ms，无输入自动探针本轮约 30 个应用帧/秒。鼠标输入、resize 会带来更多 Render 调用。没有发现停止唤醒的证据，未更改限帧选项或提高空闲功耗。 |
| Win32 窗口 | `src/native.rs` 与迁移前相同：Render 后在前台 executor 应用最新矩形。第一轮 916 次请求全部应用，无 skip、无请求/实际矩形不一致，最大排队 3.726 ms、SetWindowPos 5.296 ms；第二轮 132 次均匹配。启动 TOPMOST 及不抢焦点记录保留。 |
| 实际呈现 | 第一轮仅录制 `[480,280,800,600]` 的桌面区域；录像可见尺寸/圆角的中间画面及反向。用户反馈“效果好像不错诶，比之前的版本更流畅了”。这是当前普通模式的实际观察；未运行迁移前同环境对照，不能据此证明 GPUI 升级带来性能提升。 |

GPUI 源码位置：`gpui-pre-0.3.11/src/window.rs` 的 `on_request_frame` / `request_animation_frame`、`src/platform.rs` 的 `inactive_frame_interval` 默认值；Windows 后端 `events.rs::handle_size_change` / `draw_window` 及 `directx_renderer.rs::resize`。resize 会重建 DXGI 缓冲区，现有证据没有显示它阻断了本轮的连续桌面呈现；未 fork 或修改这些依赖。

## 已确认的宿主差异与最小修正

旧 `src/native_acceptance.rs::settings_and_tray` 无条件执行 `options.reduced = true`。这个 ignored test 专供之前的设置/托盘及 TLS 验收，生成的桌面 Compact 与普通应用外观相似；该设置确实会使 Compact/Full 直接切换。产品原入口则使用 `--reduced || Native::reduced_motion()`。本轮系统 `SPI_GETCLIENTAREAANIMATION` 查询成功、结果为开启，普通运行日志 `reduced=false`。

移除宿主强制覆盖，使其继承同一个 `Options` 偏好，并在现有 `state.json` 回执增加 `motion_reduced`。该变化只编入测试宿主，不改变产品 EXE 的动画或设置服务。没有为了模仿旧证据改回 GPUI、引入 Kit Motion API、重写动效或调整弹簧。原来的实际故障 EXE/参数未提供；“宿主差异可解释现象”与“历史产品根因确定”分开记录。

新增 UI 状态评估：无产品可见状态变化，无需新增/修改 Gallery 场景。测试宿主的动态偏好和诊断回执变化已经编译，未再打开设置宿主重跑其已通过的设置/托盘流程。

## 实际验收与边界

本轮先获得 4–6 分钟、最多三段局部动态记录的同意，用户选择亲自操作；两次窗口分别限时 90 秒、120 秒。发现第二轮覆盖缺口后如实告知，并另获约 20 秒自动补录同意。补录实际约 19 秒，三个串行实例均自动退出。没有 Gallery 全目录或 94×2 截图。

| 项目 | 实际结果 |
| --- | --- |
| Compact → Full、Full → Compact | 当前普通版本用户确认流畅；2.5 秒精简录像保留完整往返和圆角变化。第一轮含未激活及激活后的用户操作，host 日志记录前台身份；没有量化两种活跃状态的性能差异。 |
| 中途反向 | 第一轮记录多次在未到端点时反向；3 秒精简录像及应用/原生轨迹保留。额外 160 ms 周期自动探针持续反向，121 个应用帧中 120 个为中间状态；该探针故意不等待到端点，不用它证明完整往返。 |
| Reduced Motion | 第二轮用户按 R 开关，确认操作正常；机器记录 false→true→false，但该期间队列宿主没有发生 morph 目标切换，不能据此声明直接切换已被机器验证。另用现有 `--reduced` 探针补录：6 次目标切换，120 个应用帧、0 个中间状态、端点 0/1，桌面录像显示直接切换。属于自动原生记录，未另取用户逐项视觉确认。 |
| 内容显隐、进度环、状态转场 | 自动补录实际经历 Resolving→Downloading→Transcoding→Success→Idle。短录像可见旋转环、数字进度、蓝/橙/绿环、成功勾及内容退出。Agent 检查了实际录像帧；这段模拟数据不证明网络下载、真实任务完成或用户最终视觉验收。 |
| 主窗口磁吸/回弹 | 用户完成沿边移动、移出检查，反馈“都正常”，同时明确指出边缘磁吸卡顿与旧版相同。记录为既有体验问题，原因未定位；本轮保留既定参数，不标成迁移新增退化，也不抹去这条反馈。 |
| 右键菜单/画质页/返回 | 用户确认正常。日志为 closed→primary→quality→primary→closed（约 38.5–45.5 秒）；原始局部录像覆盖此段。菜单转场代码与迁移前相同。 |
| 拖动、焦点、置顶 | 用户完成真实拖动并确认正常。host 记录实际窗口移动，原生请求/实际矩形匹配；启动记录保持 TOPMOST、前台不变。既有更广的自然置顶/焦点证据按未改原生实现的边界复用，不扩展为全环境 PASS。 |
| 设置/托盘 | 复用 `4c75a89a` 真实人工交互及 `d135f851` TLS 退出证据；没有重复这两组流程或宣称修改后宿主又获完整验收。 |

必须保留的异常/缺口：

- 第一轮观察器在自动退出时与 HWND 销毁竞争，读取 bounds 抛错，未保存实际退出码；因此该轮退出码为 **unknown**。应用 stderr 为空、最终 90 秒 frame/native summary 完整、所属进程均消失。修正本轮临时观察器的退出竞争后，第二轮及三次自动实例均捕获退出码 **0**、无剩余窗口；不把后续成功倒填第一轮。
- 第二轮拖动约 55 秒后离开固定录像裁剪区；后续进度控制虽有 ACK/模型数据，不作为视觉证据。其单独 terminal 快照也未成为选中的终态，不能把控制发送成功算作 Success/Failure UI 通过。解析/下载/转码/成功视觉证据使用后面的固定位置自动补录。
- 本轮不覆盖 Failure/Partial 专属动态视觉、混合 DPI、跨屏或 compositor/GPU Present 时间戳。原生 BitBlt 视频标称 60 fps，会有重复或漏采，不当作显示器逐帧呈现测量。

## 检查与证据

- `cargo build --locked --bin ameow` 通过。受测产品 EXE SHA-256：`89c37b34790fbdead22a1980c1babf6a1cc4bebd8ddbbf66b6c8b84ce7778ccd`；冻结在 `evidence/issue32/motion-regression/before.exe`。本阶段测试宿主改动为 `cfg(test)`，没有另称该 EXE 包含修改后的宿主。
- `cargo test --locked --bin ameow reduced` 8/8；`reversal` 6/6；`leave_during_expansion_reverses_immediately_without_position_jump` 1/1；菜单及 indicator 定向过滤也通过。扣除重复命中，共 **14 个不同测试通过**。测试编译包含更新后的 ignored 宿主，未执行它。
- CRLF 感知 `git diff --check` 通过；AccessKit TLS vendor 补丁、依赖锁文件、产品模型/原生窗口代码均未改。
- [机器摘要及哈希](motion-validation.json)。
- [完整往返短录像](motion-morph.mp4)、[中途反向短录像](motion-reversal.mp4)、[普通/Reduced/状态转场对照录像](motion-comparison-states.mp4)。
- [尺寸/圆角紧凑时间线](motion-morph-sheet.png)、[进度与成功转场紧凑时间线](motion-state-sheet.png)。画面标签为录像时间，不冒充与应用时钟精密同步。
- 原始证据与临时只读观察脚本：`D:/Ameow-gpui-kit/evidence/issue32/motion-regression/`，包括三段原始局部记录、host/frame/native/telemetry、queue 控制回执、进程身份与退出结果。临时脚本不发送鼠标或键盘，使用现有 fixture 参数，不纳入产品。

## 剩余与停止点

优先问题在当前普通版本未复现，已有实际视觉和用户反馈支持继续评审。建议网页侧先检查本轮三段短录像及现有 EXE；若旧实例仍能直接跳变，需要其 EXE 路径/哈希、参数、系统动画偏好及实际宿主身份，随后仅复现该条件。磁吸边缘卡顿保留为单独的既有体验问题；用户猜测的参数原因尚未证实，不重设已验收曲线。

`D:/Ameow` 主线 HEAD 仍为 `4d57d3a70889b739cada6efc2040a1f91b6ef67e`，自动更新 dirty 工作继续独立。未写入主线工作区，未整合 main、Push、发布、清理 Worktree 或关闭 #32。所有本轮测试进程已结束。回写 #32、回读后停止，等待网页侧验收。
