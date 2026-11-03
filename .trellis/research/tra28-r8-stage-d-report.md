# Report｜R8｜阶段 D：GPUI 自绘托盘及三窗联动

2026-11-02（Asia/Shanghai）。阶段 D 开发、工程测试和安全可实施的 Windows 原生自测完成。**阶段 D 工程待网页轻量 Review；完整 Final 人工验收后置，Issue 保持 Open / In Progress。**

## 指示、现场与交付

- 执行 [R8 当前有效 Instruction](https://github.com/Wutpeach/Ameow/issues/15#issuecomment-6561004801)。开工及回写前均读取当前正文和分页评论，未见后续替代指示或重复 R8 Report。R5/R6/R7 工程 PASS 延续，不重做此前阶段。
- 沿用 `D:/Ameow-worktrees/tra26-r7-stage-b`，分支 `next/tra26-r7-stage-b`，HEAD `53a7f1d0cd4c49b957f88297d289858a2f62dfb4`。开工 20 项脏路径；既有 R3–R7 和本轮产品改动均未提交。未新建/切换工作树、reset、commit、push、merge、发布或清理旧包。
- 本轮产品范围仅新增 `ameow-next/src/tray_popup.rs`，增量修改 `src/tray.rs`、`src/main.rs`、`src/download_ui.rs`；既存其他产品文件逐字节保持开工状态。Cargo.toml/Cargo.lock、固定 Manifest、下载参数和 Runtime authority 未变。

## 完成能力

1. Windows Shell 保留占位图标注册、通知、TaskbarCreated 恢复和语言提示；移除最终用户原生 TrackPopupMenu。左键恢复主窗，右键开关单实例 GPUI 卡片。外部点击、Esc 关闭并销毁原生弹窗；支持方向键、Enter/Space、悬停和真实点击。
2. 固定约 272×224 逻辑像素卡片共享 Palette 和 Language。常驻 Ameow、简明状态、打开、设置及红色退出；读取既有 QueueSnapshot，下载、排队及红色失败数量可同时出现。覆盖未知、启动失败、准备失败、准备中及清理异常；无完整队列或逐 Job 操作副本。
3. 可查看摘要关闭弹窗并恢复既有主窗，调用既有 open_queue；不另建队列或发送重试/取消命令。设置复用既有单实例，主窗隐藏时保持隐藏。退出通过既有 request_menu_exit / ExitIntent → 确认 → Stop / stopped；用户主动托盘退出先恢复主窗前台，程序化关闭的既有策略保持。
4. 实际图标矩形来自 Shell_NotifyIconGetRect；按任务栏边缘和显示器 DPI 定位并夹在工作区内。Windows 11 折叠通知区实测后修正为贴近实际图标边缘，避免弹窗覆盖图标妨碍再次右键。四方向、负坐标、150% DPI、极小工作区及折叠区位置有纯逻辑测试。
5. 修复隐藏主窗后的偏好刷新遗漏：原先保存 ACK 已写入但偏好刷新依赖主窗渲染；现在队列轮询处理回复后调用既有 refresh_preferences 并通知观察者，主窗隐藏时设置/托盘也及时反映主题和语言。
6. 不增加全局 Hook、GPUI fork/升级、持续抢焦点循环或新的依赖。本轮直接显示/销毁卡片，不加入额外位移动画或 Magnetic Spring；因此没有新增动画需要在减少动态效果模式下继续运行。

## 最终工程验证与产物

```text
cargo test --offline --locked --manifest-path ameow-next/Cargo.toml --all-targets -- --test-threads=1
cargo build --offline --locked --manifest-path ameow-next/Cargo.toml --bin ameow-next
rustfmt --edition 2024 --check ameow-next/src/tray_popup.rs ameow-next/src/tray.rs
git -c core.whitespace=cr-at-eol diff --check -- ameow-next
```

- **226 passed / 0 failed / 12 既有 conditional ignored**。各目标 passed/failed/ignored：72/0/6、133/0/1、9/0/3、1/0/2、2/0/0、9/0/0、0/0/0、0/0/0。较 R7 新增 6 项定向测试。
- 既有 ExitIntent 启动未知/在途确认/继续后不重开、Runtime owner/lease 及 Windows 根子孙进程/reader 结算测试均随全目标通过。新测试覆盖摘要异常和混合计数、定位及几何回退；未以模拟 stopped 代替实际资源结算证明。
- 最终构建无警告；新文件定向 rustfmt 和产品 diff 空白检查通过。未批量格式化既有脏主文件。首次补测试时遇到 GPUI 同名 test 宏递归展开错误，已通过明确使用 Rust 测试宏修正；最终测试通过，不隐去首轮失败。
- 最终 Agent 自测 EXE：`tra28-r8.local/Ameow-TRA28-R8.exe`，**37,449,216 bytes**，SHA256 **4A1E54859423D70A9DEEAD0F3B20D5C925AE8AB2A04BA8D3C4DE2EBA07216EC5**。不是 Portable 新发行包。
- 独立只读代码审查发现的启动失败摘要、零面积几何回退已修正并复核；该审查不替代网页 Review 或用户验收。

## Windows 原生自测：实际输入与证据

设置、输出、TEMP/TMP、日志和固定运行时副本均位于任务 `tra28-r8.local/`。未创建真实媒体下载或手动上游查询；生产路径使用已有缓存运行时副本。进程环境代理设为 127.0.0.1:9，但不称其为网络沙箱；受控 fixture 本身不创建 Coordinator、Runtime 或网络任务。

Shell 折叠区鼠标使用 Win32 实际光标/鼠标输入，GPUI 键盘使用实际前台输入，并用原生 HWND、前台窗口、可见性、矩形、TOPMOST 和产品队列日志归因；部分 CUA 投递回执无法判定已销毁窗口，均另外检查窗口消失和进程退出，没有将投递回执直接当 PASS。

| 场景 | 实际结果及证据等级 |
| --- | --- |
| Shell 左键、右键、再次右键、外部点击、Esc、重开 | Agent 原生通过；同刻一个 `Ameow · Tray`，关闭后 HWND 消失；不会关闭设置或主窗。最终 EXE 再次核对开关。 |
| 实际折叠通知区定位 | 图标 `[2074,1232,2114,1272]`，弹窗 `[1842,1008,2114,1232]`，96 DPI，未覆盖图标，位于工作区内。原生上/左/右任务栏未覆盖。 |
| 主窗隐藏→托盘设置→复用 | 通过产品四行菜单隐藏主窗；打开设置仍隐藏，重复进入复用同一 HWND。保存深色/English 后隐藏主窗、设置及下次托盘实时同步，设置 ACK 文件为 dark/english；组件页仍可打开。 |
| 设置拖动、TOPMOST | 最终 EXE 设置窗真实拖动后 RECT 移位，WS_EX_TOPMOST 仍 true；主窗与弹窗也为 true。仅实际打开/动作时请求前台，没有循环前台校正。 |
| 空闲/组件准备失败 | 最终 EXE 分别实际呈现英文 Idle 和中文组件准备失败。失败通过任务自有普通文件作为 runtime-root 触发存储失败；不等于普通账户权限测试。 |
| 下载＋排队＋失败 | 无网络队列 fixture：下载中 3、排队 2、红色失败 2 同时显示。修改进度后弹窗 HWND、RECT、前台窗口均不变。 |
| 点击摘要 | 最终 fixture 中关闭弹窗、恢复同一主 HWND；日志 `queue_open=true`，截图显示原有 7 项队列；至 Continue 结束没有任何 QueueCommand，未重试、取消或提交新任务。 |
| 托盘 Exit→Continue | 最终 fixture 的主 HWND 取得前台，显示既有退出确认；Continue 后 exit_open=false，未发送 Stop/Cancel，进程继续。 |
| 托盘 Exit→Stop | 最终 fixture 记录单个 `command: stop`，模拟 stopped 后 exit 0。**这是受控 UI 门槛验证，fixture 不执行真实 lease/process settlement，不能称真实媒体在途 PASS。** |
| 最终 EXE 进程退出 | final-ready PID 42156、final-fixture PID 20632、final-failure PID 66416 均正常 exit 0，分别于 UTC 17:19:07.902、17:19:46.619、17:20:15.952 结束，早于保险超时。生产空队列经真实 Stop/stopped；受控在途以模拟结算区分。 |

原生测试发现并修正了折叠区图标覆盖、隐藏主窗的偏好刷新、退出确认前台三项问题。修正后的最终 EXE 重测了托盘开关、深色英文、设置拖动/置顶、混合摘要/更新稳定、摘要队列、确认前台、Continue/Stop 及准备失败；较早的完整鼠标/Esc/隐藏/复用矩阵在本轮中间构建验证，后续仅增加了退出入口主动恢复主窗，不把各中间构建统一称为最终 EXE。

## 证据入口与现场保护

证据根：`D:/Ameow-worktrees/tra26-r7-stage-b/.trellis/research/tra28-r8.local/`，本机原始文件，**截图未上传 GitHub**。本报告提供自包含结果，不将本地路径冒充公开可访问链接。

- `final-tests.log`、`final-build.log`、`baseline.json`、`before.patch`、`protection-after.json`、`native-steps.jsonl`、`launch-native.ps1`、`inspect-native.py`、`native_harness.py` 及各运行目录。
- 最终构建窗口裁图：`final-build-dark-en.png`、`final-build-mixed.png`、`final-build-queue.png`、`final-build-confirm.png`、`final-build-preparation-failed.png`。隐藏主窗偏好/组件证据：`final-settings-dark-en.png`、`final-components-dark-en.png`；浅色空闲：`final-idle-zh.png`。
- 三仓 HEAD/branch/refs/index 与冻结 Electron/扩展 status 共 14 项保护对照一致。Electron HEAD `d657f555afbc69c3dd3cb1340e209e611a95df1a`，扩展 HEAD `f7f11987bdd2931f060ada309c0f3f76dbbe91e4`。既存其他产品文件无变化，任务副本四个 runtime EXE 哈希前后一致；真实 HKCU Run/AmeowNext 仍为空。结束无本轮产品/cargo/rustc 活动进程。

## 剩余边界与停止

- 几何不可得/空矩形时，以光标和按 DPI 的系统小图标尺寸估算非零区域，按最近显示器工作区回退。该区域可能覆盖相邻托盘目标；邻近位置外点关闭和自动隐藏角落边缘推断仍有风险。纯逻辑覆盖，未强迫真实 Shell 几何失败。
- Windows 11 折叠通知区和 96 DPI 原生已覆盖；Explorer 实际重启、系统主题/语言变化、自动隐藏、原生上/左/右任务栏、多显示器/混合 DPI、Explorer 文件拖拽、完整键盘/辅助功能和主观视觉仍 **Final NEEDS HUMAN**。未为验证重启用户 Explorer 或修改真实系统偏好。
- 真实媒体在途 Job 的 Continue/Stop、Runtime lease/所有权与最终资源结算仍是 Final 重点；本轮没有额外真实外网媒体任务。R7 同步 Windows 路由解析不能硬取消的已知边界延续。

**R8 Report 已发布后等待阶段 D 网页轻量工程 Review；完整 Final 人工验收后置。停止，不 commit、不发布下一轮、不进入 Final/T04/Gate B、不关闭 Issue。**
