# Proposal

## Why

Popup 将初始标签页和两项状态查询的全部等待转化为整页白屏；已有小规模复现表明仅 status 慢两秒就会产生约两秒空白。用户已批准在同一批完成前台修复、真实后台分段测量和合理减负，使界面及时可用且状态准确。

## What Changes

- 保留 240px 现有布局，先显示中性结构；页面工具与登录态独立收敛，超时/失败可独立重试，晚到响应不得覆盖新请求。
- 只读工具查询不再等待 Cookie 同步队列；健康状态使用本次协议校验成功的 list 回包，避免多余 ping 和自身文件哈希。
- 在单一浏览器来源的 Worker 内按实际活动短暂复用 Native Host 连接，不缓存会话结果，不永久保活，断连/超时及空闲后正确释放。
- 测量 Worker 身份报告、真实 Host 冷暖启动与有界并发，以及 Windows 稳定入口校验；按成本与现有完整性契约消除冗余，不跳过未验证代码的信任边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `browser-sessions`: 中性首屏、独立有界读取与恢复，以及来源隔离、鲜活状态和有界原生连接所有权。

## Impact

主要影响 browser-extension 的 Popup、background、core、相关测试与预览。必要的 Rust Native Host/转发读取优化先与整合者划定文件边界；若需变更发行完整性契约，测量后同步补充对应 delta。复用已安装依赖与共享 target，证据保存至独立 handoff 目录，GitHub 与主线整合由既定整合者负责。
