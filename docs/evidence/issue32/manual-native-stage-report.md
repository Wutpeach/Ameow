# #32 Windows 人工交互验收与局部修复

日期：2026-11-09。依据 [剩余验收指令 6731086507](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6731086507)，
从 `D:/Ameow-gpui-kit` / `feature/gpui-kit-migration` 的
`5da7a23ef726f26e457fbc15be5a805f68714840` 继续。

本轮已补齐指定范围的用户人工操作确认，并修复测试设置窗口的英文残留。
原版宿主退出时出现 TLS AccessError，尚未定位，不能将本阶段写成全部运行时检查通过，
也不构成最终迁移验收。阶段提交的完整 SHA 由 GitHub 报告记录。

## 实际操作与证据边界

用户确认暂停其他桌面操作并允许两组有界测试，随后主动选择自己操作。
Agent 首次 Gallery 点击返回 `USER_INPUT_ACTIVE`，输入没有发送；之后由用户实际操作，
Agent 只读状态、日志和窗口。未使用通知回调、PostMessage 或模拟输入代替人工验收。

| 路径 | 本轮实际结果 | 证据与限制 |
| --- | --- | --- |
| Gallery 分类、滚动、焦点 | 用户确认 9 类切换、队列滚动/选择、长列表 Tab/Shift+Tab 焦点“验收通过，全部正常” | 人工观察 PASS；观察器从 step 27 才开始，保存 27 条无错误 ACK，只作部分佐证。未保存成功的 Gallery 截图，不声称自动逐项覆盖 9 类或全部 94 个状态。 |
| 设置语言、图标、目录 | 用户确认除英文说明残留外“其余的验收通过” | 保存/ACK/磁盘证据可见语言、图标及目录改变；图标日志为 ameow_blue / follow_appearance，没有 Apricot 特定 ACK。目录选择取消、复制依赖人工观察。 |
| 设置重开与质量 | 用户确认托盘“设置”重开保留已确认的语言/目录，“打开 Ameow”与画质入口操作正常 | 日志记录 Settings 动作及 Highest → Balanced 的成功保存。画质入口位于主窗口右键菜单；并非设置 Download 页。 |
| 真实 Shell 托盘 | 用户确认右键弹窗开关、设置、打开 Ameow 正常，随后点击退出并确认通过 | 人工物理操作 PASS。日志有 2 次 tray-popup-open、Settings / Exit 动作及 Stop → stopping；原进程退出且最终 stopped=true。不能据此认定进程干净退出，见下文。 |
| 英文残留复验 | 修复版窗口切到 English 后，用户确认“英文说明正常” | 中文/英文回归测试通过，日志为 English / Saved / pending=false。修复后截图停在 Download 页，未拍到红色说明；红色说明的原生复验依据用户确认。 |

设置保存始终使用任务隔离目录。用户在目录选择中曾短暂选中个人目录，真实目录验证执行原有的
写入探针；最终回到 `remaining-native-2/download-test`，未启动下载。不能宣称从未访问用户目录。
Agent 没有读写剪贴板；用户复制路径是本轮主动验收操作。

## 局部修复与定向检查

问题：[用户提供的英文界面截图](manual-english-before.png) 中，测试宿主阻断启动项操作的
中文原因直接显示在英文错误说明后。仅在 `settings_message` 增加 `cfg(test)` 文案映射，
保留中文并提供 `Startup changes are disabled in this test host.`，不改变生产启动项能力。

- 先扩充现有 `settings_notices_follow_effective_language`，定向运行得到预期失败：英文仍为中文。
- 修复后 `cargo test --locked --bin ameow settings_window::tests`：7 通过、0 失败；不打开窗口。
- 运行修复版原生宿主并由用户切换 English，获得上述人工复验确认。宿主日志最终为
  `1 passed; 0 failed`，没有 TLS 诊断；未捕获独立进程退出码。
- 复用既有 Gallery 截图按钮/取消/恢复、主题与真实键盘路径，以及设置保存失败/直接重试/服务重建证据，
  详见 [上一阶段报告](native-stage-report.md)。没有重跑 94×2、旧完整套件或未受影响界面。
- 这是测试宿主诊断文案修复，不增加产品 UI 状态，现有 94 个产品 Preview Scenes 无需修改。

## 退出诊断：尚未解决

原版测试宿主 PID 59056 在用户点击托盘退出后消失，日志记录 Stop / stopping、Exit，
最后设置快照 stopped=true、pending=false；用户确认窗口和图标消失。
但 `settings.log` 同时记录：

```text
thread '<unnamed>' (52992) panicked at ...std/src/thread/local.rs:429:25:
cannot access a Thread Local Storage value during or after destruction: AccessError
```

日志没有该宿主的 `test ... ok`；退出码未捕获，也未开启 RUST_BACKTRACE。
无桌面源码核查确认托盘退出走 Stop ACK 后的正常退出路径；产品图标缓存及上游 GPUI Windows
原生对话框等均存在 TLS，但现有日志无法归因。修复版仅验证语言并正常结束，
没有重复同一轮目录选择/托盘退出流程，不能据此认定异常已修复或仅属于测试。

建议后续在新的短时授权窗口内，带调用栈和退出码复现“目录选择后从托盘退出”，
先分清测试宿主/产品共用路径，再做必要局部修复。当前保留为原生退出风险，不扩大本轮桌面测试。

## 身份、清理与保护

| 产物 | SHA-256 |
| --- | --- |
| Gallery，PID 61156 / 预览 PID 43516 | `860efe4d81045d7c16ab647eb8b8adbf872a66eca562c2244f76c5ac90a18e84` |
| 原版设置宿主，PID 59056 | `bfa153b7b8d01ca84e7dc2086abf62560b01e3e900f4c56bae4af0da038659f3` |
| 文案修复版宿主，PID 48092 | `75e5afb5ce7aea2d8cd17bc33fff303a2f7b441509bb1e535517ba1ce2b775c4` |

本轮进程均已退出；修复版日志在清理核查时已显示正常结束，未重新打开窗口。
用户 AmeowNext 的 Run / StartupApproved 注册值前后均为空；测试保护继续禁止启动项读写。
两版日志的上游检查始终 idle，命令仅涉及设置及原版最后的 Stop，没有下载或更新操作。

机器摘要和原始文件哈希见 [manual-native-validation.json](manual-native-validation.json)。
[修复后 Download 页截图](manual-english-download.png) 只证明该页实际运行与排版，
不作为红色说明的图像证据。原始日志、用户截图、局部截图、状态、输入拒绝回执及冻结 EXE
保留在 `D:/Ameow-gpui-kit/evidence/issue32/remaining-native-2/`；旧证据没有覆盖。
本地文件没有作为 GitHub 上传资产发布，阅览需使用本 Worktree。

## 遗留与停止位置

1. 定位上述退出 TLS 诊断；人工退出外观 PASS 与进程干净退出保持分开。
2. 启动项真实读写尚未验收，仍需隔离方案与独立授权。Apricot 未取得特定机器 ACK。
3. 混合 DPI、跨屏、合成呈现节奏及最终集中回归仍待后续关键交付节点。
4. main 核对仍为 `4d57d3a70889b739cada6efc2040a1f91b6ef67e`；未整合自动更新 dirty 工作。
   主线稳定提交同步及更新/重启联合回归不属于本轮。

完成本地提交及 #32 回写/回读后，停止等待网页侧阶段验收。未 Push、合并 main、发布、
清理 Worktree 或关闭 Issue；未申请最终合并收尾。
