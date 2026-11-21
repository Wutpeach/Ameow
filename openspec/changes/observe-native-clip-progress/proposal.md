# Proposal

## Why

普通下载已恢复真实进度，但区间下载由 FFmpeg 执行，只在结束时触发 yt-dlp hook，因此界面长期没有百分比和速度，容易误判为停滞。

## What Changes

- 读取 FFmpeg 原生机器进度，将已输出媒体时间除以选定区间时长作为切片进度。
- 显示原生处理倍率，明确其为视频时长/实际耗时，不能冒充网络 MB/s；缺失和过期保持未知。
- 复用现有队列、主环、取消与认证隐私边界，保留原生快速 stream copy 和实际系统路由。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `progress-presentation`: 增加真实切片媒体时间及处理倍率的展示来源。

## Impact

yt-dlp adapter、TransferProgress、现有 GPUI 进度文案与定向回归；不引入依赖，不修改路由策略或下载模式。
