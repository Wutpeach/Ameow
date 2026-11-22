# Design

## Context

精确区间逐输入seek后在同一个FFmpeg中取数、解码、libx264编码和封装，可流水重叠，不是固定的“完整下载后再编码”。当前受管FFmpeg9.0.2及yt-dlp2026.10.26已经实测支持8MiB输入请求，现有两处模式排除是精确取数优化的直接限制。

## Goals / Non-Goals

复用实际HTTPS全轨门控和独占嵌入源码装载，改善输入取数及同目标CPU编码速度。保持CRF18、原分辨率/音轨、AAC192k、精确帧/采样边界和真实核验。整体runtime/启动/校验等待留0.5.2，不新增profile、GPU、编码框架或日志系统。

## Decisions

- 仅移除Rust装载门槛和原生PP的precise排除；实际YouTube/section/HTTPS/清单/冲突检查仍由相同处理器全轨执行。输入request_size不改变输出编码选项，普通整片及非YouTube不装载。
- preset从fast改为faster，保留libx264/CRF18/AAC192k。单个8秒1080p运动噪声合成源，四线程BelowNormal串行测得fast5.476秒、faster2.370秒；faster文件小26.4%，SSIM .968027对.967644，PSNR低.115dB，未出现本样本明显质量/文件代价。veryfast仅再快.198秒却比faster文件大7.1%、PSNR再低.813dB，不采用。
- 不将合成收益倍率外推用户真实内容。非关键帧1.250–4.750秒复用已有音画脉冲素材，验证两轨8MiB、重新编码、首末参考帧/音画/严格时长和相关取消，不重跑快切套件。

## Risks / Trade-offs

- preset改变编码器决策，单源指标不能保证所有素材感知质量 → 维持CRF/分辨率/音频，提供本人复测，明确合成覆盖限制。
- 网络与编码可互相遮蔽 → 分开陈述取数策略、纯本地编码测量与原生端到端fixture，不把重叠阶段简单相加。
- Mac/真实账号未测 → 只声明Windows根开发版定向证据，完整矩阵留Tag前。

## Migration Plan

原快切验收已归档于795997c6；本次独立main提交推送与一次根开发版增量构建。本人使用cargo run --locked --bin ameow并开启精确复测，无需刷新扩展。无专用包或runtime缓存副本。
