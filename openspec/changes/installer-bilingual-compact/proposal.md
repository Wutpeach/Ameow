# Proposal

## Why

现有 Windows 安装器仅英文、现代向导默认偏大且缺少 Ameow 品牌图标。#67 已批准按当前用户的 Windows 显示语言选择中英，并提供紧凑、完整可操作的安装流程。

## What Changes

- 沿现有 Inno Setup，按显示语言默认选择中文或 English，其他语言回退 English；不按区域格式选择。
- 本地化内置向导与安装器自有任务、启动选项、安全检查和注册失败提示；覆盖简体及繁体中文环境。
- 缩小默认窗口，随 DPI 缩放，复用正式 Ameow 应用图标。
- 提供准确候选身份、隔离安装及中英实际窗口证据，保留现有签名、正常退出、版本与注册安全语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-integrity`：Windows 安装器的语言、布局、品牌与隔离验证要求。

## Impact

涉及 distribution/ameow.iss、随仓库固定的 Inno 中文消息资源、Windows 打包材料记录和工程说明；不修改下载、应用更新协议、Mac 或其他 PR。
