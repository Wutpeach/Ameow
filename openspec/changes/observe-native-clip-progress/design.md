# Design

## Context

见 proposal.md。yt-dlp 2026.10.26 的 FFmpegFD 只在成功退出后发 finished hook；现有 JSON byte feed 无法观察区间执行。隔离12秒样本已验证 -progress pipe:1 连续输出 out_time_us、speed 和 progress。

## Goals / Non-Goals

**Goals:** 从真实 FFmpeg 标量读出切片完成比例和处理倍率，复用既有队列展示与取消边界。

**Non-Goals:** 不把 total_size 当网络字节；不增加编码、整片回退、代理策略或另一个进程/日志系统。

## Decisions

- 只为切片添加 ffmpeg_o 的 -progress pipe:1、-stats_period 0.2 和 -nostats。沿用原有 stream copy、input seek 及系统路由。
- ProgressFeed 在选流身份核对后启用切片解析；只读 stdout、完整帧块的 out_time_us 与 speed，缺口清空未完成帧。片段输出时间相对区间时长形成 fraction，独立 media_speed 字段承载倍率，bytes_per_second 保持空。结束块进入中性 Processing。
- UI沿用主环和固定队列轨道，主状态“处理速度 0.7×”，行内“50% 0.7×”，中英文对应。不改变布局或视觉token。
- 认证仅在内存解析白名单标量，沿用现有安全输出清理；进度不参与成功、失败或取消判定。

## Risks / Trade-offs

- [关键帧及音视频时间略越界] → UI继续最多99%，真实结束撤下数字，最终验证不变。
- [解析/启动/seek阶段无输出时间] → 保持未知阶段，不估算。
- [某站点或平台不提供同样观察] → 如实未知，缺失观察不阻断交付；单独陈述实际平台覆盖。

## Migration Plan

新增可选字段具有serde默认值；本地构建供正常重启验收，回退本次提交即可撤回观察与文案。
