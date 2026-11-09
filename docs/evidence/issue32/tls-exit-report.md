# #32 TLS AccessError 专项排查与修复

2026-11-09，依据 [6731587317 开发指令](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6731587317)。
从 `D:/Ameow-gpui-kit` / `feature/gpui-kit-migration` 的干净提交
`4c75a89a1e7664d7560639e2a45d5cefd0738f1d` 继续。

## 结论

直接缺陷已定位到 **AccessKit Windows 0.34.0 的 StringBuffer TLS 缓存**。
Windows 在线程退出的 COM/IME 清理阶段分派窗口激活通知，经 GPUI 调用 AccessKit，
此时字符串缓存 TLS 已销毁，`LocalKey::with` 触发 `AccessError`。
问题可以在不创建任何窗口的真实缓冲区析构回归中独立复现。

已为现有 AccessKit 0.34.0 添加局部源码补丁，将该缓存按可选的内存复用处理。
相同人工原生路径修复前两轮均异常退出，修复后退出码 **0**、无 TLS panic、宿主测试成功，
Stop/stopped、应用返回和窗口/托盘清理证据一致。本项指定复现路径通过，停止等待网页侧验收。
本次完整本地 Commit SHA 记录在 GitHub 阶段报告中。

## 失败与成功轮次

用户本轮明确同意最多三轮、实际操作预计 5–7 分钟，并选择亲自操作。
每轮只启动一个隔离宿主。Agent 没有发送鼠标/键盘输入，也未截取新的桌面图片。
三轮宿主运行总时长约 275 秒，含等待人工操作；没有运行 Gallery 或其他已验收 UI 流程。

| 轮次 | 同一路径 | 实际退出码 | 日志结果 |
| --- | --- | --- | --- |
| 1：原冻结宿主，SHA bfa153b7… | 设置 → 目录选择取消 → 选择测试目录 → 关闭设置 → 真实 Shell 托盘退出 | `3221226505` / `0xC0000409` | TLS panic，无测试成功结束。`RUST_BACKTRACE=full` 有完整帧列表，但缺少原版匹配 PDB，大部分 Rust 帧未解析。 |
| 2：既有文案修复版 + 匹配 PDB，SHA 75e5afb5… | 同上 | `3221226505` / `0xC0000409` | 同一 TLS panic，取得足以定位的 Rust 函数名；最终 UI stopped=true。 |
| 3：AccessKit 修复版 + 匹配 PDB，SHA 7a0dc33e… | 同上 | **`0`** | 无 panic；`test … ok` / `1 passed; 0 failed`；无超时或强制结束。 |

所有轮次都由持续存活的父进程 `Popen.wait()` 取得真实宿主退出码；父进程自己的退出码
未被当作宿主结果。旧冻结 EXE/PDB、失败日志和历史验收产物均保留。
第二轮已有明确调用栈，因此未增加“不经过目录选择”的桌面对照。

## 根因与归属

第二轮完整符号日志：[tls-stack-symbolized.txt](tls-stack-symbolized.txt)。关键链路为：

```text
RtlExitUserThread / LdrShutdownThread
  → Windows COM / IME teardown / CoUninitialize
  → PeekMessageW → 窗口过程 → GPUI handle_activate_msg
  → accesskit_windows::Adapter::update_window_focus_state
  → AdapterChangeHandler::node_updated
  → StringBuffer::acquire
  → LocalKey<RefCell<Vec<Vec<u16>>>>::with
  → panic_access_error
```

上游实现见 [AccessKit util.rs](https://github.com/AccessKit/accesskit/blob/c88605b96d04431f9c3c792464a0f2f253480e94/platforms/windows/src/util.rs)。
`STRING_SCRATCH` 在线程结束时先被析构，后续系统焦点回调仍可能需要转换字符串。
原实现将缓存可访问性作为必需条件，acquire 和 Drop 都调用 `with`。

- **测试宿主**：libtest 工作线程正常结束会进入线程析构，暴露这个系统回调时序；
  本轮未发现设置 ACK、隔离 transport 或启动项保护直接产生 TLS panic 的证据。
- **Ameow 产品**：正式应用解析到同一个 AccessKit/GPUI 依赖链，不能判定为纯测试问题。
  本地补丁覆盖产品构建；本轮未启动正式生产实例，因此不声称生产实例已复现或完成端到端验收。
- **GPUI / Windows / AccessKit**：GPUI 的 Windows 激活回调进入 AccessKit，直接失败位置为
  AccessKit 的 TLS 内存复用缓存；COM/IME 的迟到回调是已观察到的触发条件。
  未将 Windows API 私有帧全部解析，也未声称定位了 GPUI 每个 HWND 的最终析构顺序。

产品图标缓存与原生文件选择线程曾是静态候选；实际符号栈和独立缓冲区回归把直接缺陷定位到
AccessKit。没有证据需要修改下载服务、托盘命令语义或生产设置保存路径。

## 最小修复与维护范围

通过 `[patch.crates-io]` 使用 `vendor/accesskit_windows` 中的现有 **0.34.0** 源码；
GPUI 0.3.11、gpui-base 0.9.0 与其他根锁文件版本保持原值。根 Cargo.lock 仅去掉
该包改为本地源码后不再适用的 registry source/checksum 两行，没有升级其他依赖。

唯一有运行时修改的上游文件为 `src/util.rs`：

1. acquire 使用 `try_with`；TLS 已销毁时创建临时 Vec。
2. Drop 使用 `try_with`；缓存不可访问时正常释放 Vec。

辅助功能与焦点事件继续启用，正常缓存容量/复用策略保持原行为。未引入退出延迟、
自定义消息循环、吞 panic、强制成功退出或泄漏缓存的处理。
上游源码、来源 commit、crate checksum 与两份许可证已保存，详见
[补丁说明](../../../vendor/accesskit_windows/AMEOW-PATCH.md)。
确认兼容的上游版本包含等价修复并通过定向退出检查后，应移除此本地补丁。

宿主另增加两个 test-only 观测点：transport 确认 stopped 的日志，以及 Application::run
正常返回文件；不改变产品退出流程。未增加或改变产品 UI 状态，现有 Preview Scenes 无需更新。

## 定向验证

- 新增 AccessKit 子进程回归：先初始化一个析构观察器，再初始化 TLS 缓存，
  使观察器在缓存销毁后使用并释放实际 StringBuffer。原实现失败，子进程 `0xC0000409`，
  日志为同一 AccessError；补丁后成功。测试先确认 TLS 已不可访问，避免只验证普通使用。
- `cargo test --manifest-path vendor/accesskit_windows/Cargo.toml --target-dir target --locked --lib util::tests:: -- --nocapture`：
  **5 通过**，包括新增回归、缓存复用、并发租借、超大容量释放与缓存数量边界；不打开窗口。
- `cargo test --offline --bin ameow --no-run --message-format=json`：通过，将本地补丁编入宿主。
- `cargo check --locked --bin ameow`：通过，产品目标解析到本地 AccessKit 补丁。
- `isolated_transport_saves_through_real_owner_and_refuses_download_actions`：**1 通过**，
  覆盖宿主新增停止记录后的真实设置/ACK/磁盘及下载拒绝边界。
- 第三轮原生宿主：**1 通过**，用户完成真实选择/取消和 Shell 退出；
  实际退出码 0，`application_run_returned=true`，transport-stopped=true，最后 UI stopped=true。
- CRLF 感知差异检查、版本/源码来源及 EXE 指纹检查通过。原有上游测试编译存在一条
  simple.rs 未使用 import 警告，未为本次修复改动该无关代码。

## 资源与环境核对

第三轮系统查询到测试托盘图标已注册；退出后相同 owner HWND 不存在，
`Shell_NotifyIconGetRect` 返回失败，所属顶层窗口列表为空，用户也确认窗口和图标消失。
父进程在运行中未观察到宿主直接子进程，退出后无残留直接子进程。
这些结果证明本轮进程结束后的清理，不额外声称所有原生资源都在 TLS 析构前销毁。

三轮使用新的任务设置目录，日志命令仅为保存设置/Stop；上游查询 idle、无下载/更新操作。
用户 AmeowNext 的 Run / StartupApproved 注册值前后相同。main 只读核对仍为
`4d57d3a70889b739cada6efc2040a1f91b6ef67e`，未读取或整合其 dirty 开发成果。

精简机器证据：[tls-exit-validation.json](tls-exit-validation.json)。原始日志、完整回执、
冻结 EXE/PDB、构建日志与复现观察器位于 `D:/Ameow-gpui-kit/evidence/issue32/tls-*`。
本地文件未作为 GitHub 附件上传，也未 Push。

## 边界与后续

本项指定异常路径已获得根因、回归和原生正常退出证据。尚未验证正式生产实例、
屏幕阅读器全流程、其他输入法/Windows 环境或 Release 原生退出；不扩大为全产品验收。
混合 DPI、跨屏、真实启动项及主线更新/重启联合回归仍属后续独立门槛。

本轮只形成本地提交和 #32 报告；不整合 main、不 Push、发布、清理 Worktree 或关闭 Issue。
完成回写与回读后停止等待网页侧验收，不启动最终合并。
