# 验证记录

## 身份与范围

- Issue #67；基座 origin/main `3083076b6d4268e190cd63499d868cbd4bb8af55`；本任务分支 cindy/swift-hawking，PR #69。
- Inno Setup 6.7.1。普通候选经 scripts/package_windows.ps1 验签并实际编译，应用核心复用现存干净签名 `0.5.0 / 44dba2364110849a494c6886d50cc666a3675509`，不声称新 HEAD 的完整 App 构建。安装器源码身份、资源与安装器哈希由 delivery.json 单列。
- 初次干净候选 `6e8558d7d2bc2fcddf8164ad8e08df34771cfafb`，安装器 SHA-256 `db6b7e4c2339fb919cd3aba2ab91f6ba419e25fd69d9e7d2f2f453ff7166696c`；后续 `949f4b78` 仅补中文长恢复提示换行，已重新编译并实际复看；最终候选见本任务交付回执。
- 验证变体从同一已验签 payload 编译，AppId `Ameow.Issue67.Validation`、名称 `Ameow Installer Validation 67`、定义 ValidationBuild；不是 RFC fixture，不把它混作普通发行候选。未启动所安装的 App。

## 实际检查

证据根目录：`D:/Ameow-handoffs/installer-bilingual-compact-20261120`。前台经来源协调，实际 2026-11-20 15:07:09–15:16:23 +08，全部自有窗口正常关闭后归还；未移动全局鼠标、改 OS 语言/区域或终止用户程序。

- 普通候选 `normal-en/`、`normal-zh/`：目录、任务、确认及取消；原生 HWND 513×399，96 DPI，页首正式 ICON。
- 隔离变体 `native-en2/`、`native-zh2/`：目录、桌面图标任务、确认、实际进度、完成与默认不勾选启动；`uninstall-en/`、`uninstall-zh/` 为真实自有卸载流程。中文、英文页面已亲看，内容及按钮未发现挤裁。
- `error-en/failure-0.png` 与 `error-wrap/failure-0.png`：真实不同版本文件拒绝。发现无空格中文长提示裁切后补显式换行，后者已复看完整错误与恢复指引。
- `automatic-language-results.json`：真实隔离安装中，仅在自有进程范围模拟 Win32 UI/区域语言 API，核对 Inno 安装注册的实际所选语言；英文/中文区域、中文/英文区域、日文回退、台湾/香港/澳门/新加坡共七例通过。连续安装证明旧语言不覆盖当前 UI 选择，已有安装根 state.json 字节保持。
- `actual-os-language.json`：本机真实 zh-CN，无语言 API 模拟，默认简体中文。`normal-zh-tw/`、`normal-fallback/` 为进程模拟后实际普通窗口的繁体和 English 回退截图。
- `language-resource-check.json`：两中文资源各 293 个消息键、数字占位符与本机 SDK English 一致，固定上游 SHA 与 Git blob 字节一致。图像来自正式 ICO 的 256px 帧。
- 普通打包校验、新增来源身份失败拒绝检查与编译后来源/材料复核通过；helper 独立失败检查不称为端到端故障注入。Rust/fixture 回归由精确 head CI 执行。

## 限制与清理

- 实测 Windows 单机、96 DPI；未改变显示缩放，其他 DPI 和真实 English/繁体/其他语言 Windows 未实机验证，保留原生缩放机制。语言 API 模拟与 /LANG 布局覆盖不等于多 OS 验收。
- 系统原生 MessageBox 按钮遵循本机 Windows 语言；English 安装器下系统 Yes/No/OK 在当前中文 OS 可显示中文。
- 截图通过 PrintWindow 从自有窗口取图，未激活或抢占其他应用；早期 `native-zh/`、`native-en/` 的 ImageGrab 被桌面遮挡，排除其图片，不作为验收证据。
- 自有验证卸载注册、快捷方式和进程已清；普通候选始终只取消预览，未产生 Ameow.Rust 安装注册。安装器按既有规则保留自身根 state；这些只属于任务证据目录。未触碰日常配置/Store/队列或启动注册。
- 无 Tag、Release、资产上传或部署，Mac 无功能变更。
