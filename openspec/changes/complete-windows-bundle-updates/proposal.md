# Proposal

## Why

Windows 旧载荷只更新主 EXE，配套 CLI、host 和扩展可能缺失或停在旧版；安装后的启动器名称及无品牌资源也使桌面入口难以识别。用户已批准 #87/#88 在 0.5.2 完整重装边界下实施。

## What Changes

- **BREAKING**：0.5.2 起根 Ameow.exe 为稳定启动器，不兼容旧 Launcher 名称、快捷方式或单 EXE 更新 ZIP；开发 cargo run 保持直接启动主程序。
- Windows 完整 portable ZIP 同时作为后续应用更新载荷，整套版本匹配、Ready 确认、安全失败及回退。
- 安装快捷方式及启动项引用有正式图标和 FileDescription 的稳定入口，扩展固定磁盘路径在活动版本确认后更新。
- 目标发行五资产：Windows 安装 EXE、完整 portable ZIP、Mac App ZIP、两平台签名 JSON；本次只改源码，不发行。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-integrity`：完整载荷、稳定入口、五资产及真实消费者证据。

## Impact

src/app_update、CLI/host 定位、build.rs、Windows 安装与交付脚本及持续维护的打包文档。Preferences、Full UI 与 Mac 更新载荷保持独立所有权；公开 0.5.1 链接、资产、feed 与生产私钥不动。
