# Proposal

## Why

下载器的新版本信息与浏览器扩展的待重载动作需要集中在组件页，并准确区分已查看、可安装与浏览器实际生效。现有单一 yt-dlp 手动流程不能覆盖已批准的 #81/#83。

## What Changes

- yt-dlp 与 gallery-dl 自动每日检查、手动刷新及显式更新/恢复，使用同一运行时 owner 安全切换。
- 组件导航保存逐版本已读，组件行保留真正可更新状态；不支持的组合提示更新 Ameow。
- 浏览器扩展置于组件首行，依据已交付文件和浏览器真实身份提示待重载，Full 独立呈现待处理条目。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `runtime-management`：双下载器检查缓存、适配判断与独立选择的安全组合。
- `desktop-interaction`：组件导航未读、组件行待处理及扩展 Full 入口。
- `browser-sessions`：浏览器已加载扩展身份与磁盘配套文件身份分离。

## Impact

影响 upstream、runtime_update、queue、组件设置页、Full 以及 background/host 身份协议。复用现有运行时、主题和控件，不新增依赖，不改变应用更新策略，不执行发行。
