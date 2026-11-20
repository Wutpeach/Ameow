# Proposal

## Why

#46 改以开发便利优先。现有三个下载探针重复构造正式协调器，但缺少一致的隔离、超时、身份与自动证据，Agent 难以重复运行和判断退出。

## What Changes

- 增加仅 debug + dev-tools 可用的 ameow-cli dev，独立持有有限任务并保存有界事件和最终结果。
- 真实任务使用正式组件、Adapter、协调器；离线固定故障场景明确标为合成 Adapter 的核心回归。
- 核对替代及所有调用点后退役三个重复探针；保留具备独有原生、更新、发行能力的工具。
- 普通 CLI 保持桌面 owner 及原退出协议；不建设服务器、常驻服务、GUI 附着或新下载业务。

## Capabilities

### New Capabilities

- `developer-execution`: 开发构建的隔离有限执行、场景、身份、证据和退出边界。

### Modified Capabilities

- `desktop-control`: 明确普通控制 CLI 与显式开发执行的适用边界。

## Impact

涉及 Cargo feature、CLI 分派、开发执行模块、examples、调用提示、开发文档、回归及 CI。复用现有依赖与核心；不改发行资产、签名信任、生产实例或其他工作树。
