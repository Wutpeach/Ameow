# Design

## Context

动机见 proposal.md。组合基线是当前 main 加 PR64（包含 PR63）与 PR61。现有执行器已统一持有 runtime、认证 watch、工作区和 cleanup；现有 owner 协议有 Hello、任务关联及 show/wait/cancel。

## Goals / Non-Goals

复用现有生命周期，在 Adapter 边界新增 inspect 安全 DTO。独立 dev run/scenario 保持自己的无 GUI 开发域；本批不扩展其区间参数或登录态导入。

## Decisions

- 只解析作为明确标记的队列任务，继续共享 FIFO3、准备、cancel、Held 与外层 join；单独 Inspected 终态消除下载成功歧义。比新建旁路执行器更少重复资源权威。
- CLI 入口采用 dev inspect，要求实例 ID；可选实例根选择已有隔离域，省略则明确绑定默认域 owner；请求协议使用带能力协商的 Inspect。owner 在 debug+dev-tools 构建开放，普通构建拒绝。
- 原生 Adapter inspect 仅执行 resolve，不调用 execute/transfer；AutomaticAdapter 明确路由 yt-dlp。DTO 不含 format_id 或媒体 URL，inspect 在 admission 前清空自由标题，仅保留经正式校验的身份组成。
- owner 摘要加入现有 response 的可选字段，兼容旧 owner，能力未知为 null，构建 hash unknown。CLI --version 继续代表客户端。
- GUI 展示过滤开发 inspect 任务；既有 retry 对 inspect Held 仅请求原生清理重试，同任务 ID，不重启解析。保留同一个底层队列权威与普通下载行为。

## Risks / Trade-offs

- 解析仍可能联网和等待真实清理 → 展示准备与任务状态，使用现有 cancel/wait，不宣称硬流量或时间预算。
- 新枚举终态影响调用者 → 编译覆盖穷举并定向回归普通提交、区间和资源。
- 真实账号需要用户指定域与执行对象 → 本地使用合成 Store；真实样本另行协调，不写公开 URL。
