# Proposal

## Why

现有逐站列表和分散的连接入口难以区分授权、缓存、最近同步与连接事实。用户已于 2026-11-21 通过 connect-v8，授权将其落地到实际产品并同步文档。

## What Changes

- 桌面按实际记录显示品牌圆形徽章、短状态及唯一共享详情；保留移除。
- Popup 保持当前网页单站，区分零可用 Cookie、分区排除、旧快照与最新失败。
- 单一连接入口复用本机配置，提供实际扩展路径复制及原生九秒操作演示。
- 完成双语、浅深、键盘、减少动态与隔离 Gallery 证据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `browser-sessions`: 会话管理、连接引导与事实表达。

## Impact

影响原生设置、扩展 Popup、品牌 SVG、Gallery 和浏览器会话规范。复用既有配置命令与会话协议，不更改认证、存储、下载或队列；README 与 site 由独立协作任务负责。
