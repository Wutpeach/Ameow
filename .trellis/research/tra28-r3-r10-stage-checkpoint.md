# Ameow #15｜R3–R10 阶段性 Git 保存

2026-11-03，用户明确授权将当前唯一 Rust Next 工作树中 R3–R10 累积的有效开发成果整理为本地阶段提交。此次只保存已有成果，不新增产品功能；不重建每轮历史提交，不 push / merge，不启动 #17（T04）。实际提交身份以本文件所在提交的 Git 记录和 #15 回写为准。

## 保存范围

- 独立单实例设置中心、四页布局、主题/语言与 SaveSettings ACK、Windows 当前用户登录启动及单实例信号。
- Windows Shell 托盘入口、GPUI 自绘弹窗、主窗/设置窗/托盘联动、队列直达，以及共用 ExitIntent → Continue / Stop / stopped 路径。
- 组件可信版本展示、手动只读上游 stable 查询、B9 可见反馈/失败/冷却/单 worker 约束、诊断脱敏复制和安全重试门。
- 相应单元测试、队列快照/fixture 和 example 的字段适配，以及 R6–R10 报告、视觉反馈、验收与相关 journal。

产品文件共 18 项：

- ameow-next/Cargo.toml
- ameow-next/examples/download_queue.rs
- ameow-next/src/context_menu.rs
- ameow-next/src/download/mod.rs
- ameow-next/src/download/neutral_tests.rs
- ameow-next/src/download/queue.rs
- ameow-next/src/download/settings.rs
- ameow-next/src/download/upstream.rs
- ameow-next/src/download_ui.rs
- ameow-next/src/login_startup.rs
- ameow-next/src/main.rs
- ameow-next/src/queue_fixture.rs
- ameow-next/src/settings_components.rs
- ameow-next/src/settings_window.rs
- ameow-next/src/tokens.rs
- ameow-next/src/tray.rs
- ameow-next/src/tray_popup.rs
- ameow-next/src/ui_text.rs

当前依赖版本、Cargo.lock 和运行时 manifest 不变；Cargo.toml 仅为已有 Windows 依赖打开所需 API features。截图、EXE、Runtime 副本、日志、临时脚本与其他 .local 证据继续留在本地，不纳入 Git，不删除。journal/index 内 Session 310–312 的知识迁移/检索记录与本次产品提交无关，选择性留在工作树；Session 313 起的 #15 记录纳入本次快照。

## 复用的验证与验收

- R10 最后定向 bin 测试：139 passed / 0 failed / 1 既有 ignored；最终增量开发构建成功无 warning。此前 R9 全目标工程检查及相关 R6–R8 报告保留为历史证据，不冒充此次重新执行。
- R10 原生证据包括组件页及三页延伸的 Light/Dark × 中文/English 截图、偏好实际保存、路径复制/Tooltip/键盘焦点、文件夹选择取消、设置窗口关闭/重开与 TOPMOST。
- 当前开发 EXE SHA256 c009a77c36e401b05ea9232a92be38b79f61a52bb235766bc0b31361bf23274d，37,627,392 bytes，与最终 R10 验证记录一致。提交准备没有修改产品源码，不为 Git 保存重复构建或完整 UI 点击测试。
- 用户 [R10 设置中心四页人工视觉验收](https://github.com/Wutpeach/Ameow/issues/15#issuecomment-6581541038) 已通过；[母版报告](https://github.com/Wutpeach/Ameow/issues/15#issuecomment-6580570661) 与 [其余三页报告](https://github.com/Wutpeach/Ameow/issues/15#issuecomment-6581120718) 保留。

## 阶段边界

此提交不表示 #15 整体 Final PASS。托盘视觉仍未最终验收，多屏/混合 DPI、系统 Reduced Motion 改变、Explorer 重建及真实媒体 Continue–Stop 等未覆盖项按原报告保留。R10 官方只读检查实际返回 HTTP 403，未宣称成功；R7 同步路由解析不可硬取消、R8 Shell 几何回退命中限制继续有效。

提交后停止开发，#15 保持 Open；#17 / T04 仅是用户指出的下一项任务，本次未开始修改其代码。冻结 Electron 与浏览器扩展工作树不重置、不覆盖，所有历史证据保留。
