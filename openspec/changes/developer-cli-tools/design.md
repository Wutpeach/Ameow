# Design

## Context

见 proposal.md。三个 example 使用同一 DownloadCoordinator，却有默认生产 runtime、不受限停止等待及不一致输出。普通 control/cli 已有生产路径隔离、随机身份和机器 envelope。

## Goals / Non-Goals

目标是一个命令创建隔离环境并运行有限场景。只增加 dev-tools gated 模块和 CLI 分派，复用依赖。原生 GUI 用普通 CLI 的 instance-root 与现有 Gallery/native 工具；不嵌入 Python 或重写截图系统。

## Decisions

- `dev run --root DIR --url URL` 支持有限多 URL、quality、cancel/stop 定时、一次 retry-failed 与 duplicate-first。固定 root/settings.json、runtime、output、evidence，运行记录原子排他创建，禁止混用。需要 warm cache 时调用者只向该新域复制自己的匹配缓存，正式 RuntimeManager 仍核验。
- `dev scenario --root DIR --case ...` 提供少量离线核心场景；仅该 gated 模块可构造 Data fixture，标明 synthetic-adapter，不让生产 Adapter 接受任意数据。真实 run 始终使用 composition。
- 不建立 socket/server。每次调用新实例身份，mutation 生成 request_id，记录提交/重试关系。报告保存 EXE SHA256、编译源身份及工作区变化摘要；不把当前 checkout 冒充构建提交。
- 运行到期请求 stop，再等有限宽限期。仍 Held 时正常返回非零及未结算事实，不调用 kill，不将退出当作 owner settled；外部中断若无最终结果也不是完成。
- 证据先写入独立目录，每条事件 flush，限制条数；最终结果独立保存。只序列化有用的状态字段，不复制完整 accepted URL、设置或 raw stderr；文件使用 root 相对路径、核字节/hash。

## Risks / Trade-offs

- [合成 Adapter 不等于正式下载器] → 标签区分，并用本地 HTTP 媒体 + 正式组件做真实 run 定向验证。
- [停止不能保证 Held 结算] → 立即事件、明确超时与实际字段，不改后代守卫。
- [GUI 依赖桌面与平台] → 保留独有工具，只复用与本次未改行为一致的旧证据，不虚报 Mac 焦点/手势。

## Migration Plan

验证新命令后删除 download_job、download_queue、macos_live_download_probe，迁移 retired bridge 引导及测试。列出其余工程工具的职责与保留依据。Draft PR 交来源复审，不合并或发行。
