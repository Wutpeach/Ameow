# Proposal

## Why

普通 YouTube 下载的原生 HttpFD 使用有限 Range，快速区间的 FFmpegFD 没有沿用该设置；相同公开样本的短区间及 125 秒对照支持有限请求降低持续取数等待。用户已授权以 8 MiB 单参数接入 main，随后本人复测。

## What Changes

- 在编译嵌入、attempt 专属隔离装载的 yt-dlp 原生 before_dl 处理器中，按当次实际选流验证 YouTube HTTPS 快速区间，为所有合格输入加入 8 MiB request_size。
- 保留原生选流、认证、路由和普通/精确/非 YouTube/HLS 的现有参数；未知或冲突安全不注入。
- 只做相关门控/本机合成真实引擎验证及一次开发版增量构建，复用已有公网性能证据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- download-execution：YouTube HTTPS 快速区间的有限请求与固定受管原生处理器隔离。

## Impact

仅 yt-dlp Adapter、嵌入 Python 原生处理器及其定向测试。没有新增环境依赖、外部下载器、代理转发或选流限制；不改变现有时长窗。不承诺用户旧 Job7 或新任务已由此定位唯一根因，不承诺所有路线的倍率。
