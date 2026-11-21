# Proposal

## Why

取消被正式队列受理后，主浮窗与任务行仍可能显示下载或保存；Windows owner 已进入 Held 时，普通取消只置标志，不能推进存活进程的停止。用户已授权并行修复两条已确认路径，该工作不阻塞 0.5.1 发行。

## What Changes

- 从点击发送、正式受理到真实结算持续呈现取消状态，抑制重复操作并保留拒绝反馈。
- Windows 首次取消允许一次有界、幂等的既有清理重试推进；继续失败仍保留 Held、owner 与显式重试。
- 用正式队列、原生进程与真实界面验证状态及释放屏障。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `progress-presentation`: 取消发送中与受理后的主浮窗、任务行反馈及重复操作边界。
- `process-ownership`: Windows live Held 的首次取消推进与失败后重试边界。

## Impact

影响队列快照、取消命令、Windows supervisor 和 GPUI 状态投影。保留 PR74 Mac 修复；不扩展大文件 copy/flush/hash 可中断重构，不操作日常 App、账号、队列、下载目录或其他候选。
