# 评估下载后端上游更新必要性

## Goal

核对 Ameow 当前下载后端依赖的上游发布情况，并基于现有集成方式、平台约束和已知风险，给出是否值得更新以及应优先更新哪些组件的判断。

## Confirmed Facts

- 仓库当前的下载体系不是单一后端，而是多引擎组合：
  - `yt-dlp` 作为主要通用视频下载后端。
  - `gallery-dl` 作为图片/图库类下载后端之一。
  - `douyin-dl` 作为 Douyin 专属后端。
- 当前锁定版本定义在 `electron/managedRuntimeBootstrap.mts`：
  - `yt-dlp`: `2026.03.17`
  - `gallery-dl`: `1.32.0-dev:2026.03.30`
  - `douyin-dl`: 包版本标识 `2.0.0`，实际安装源固定到 Git 提交 `5144bd3dec91cd2711cfdccbf36c10af17eb93fc`
- Windows / macOS 的 `yt-dlp` 与 `gallery-dl` 采用 pinned managed runtime。
- macOS 上的 `yt-dlp` 还受 Python 版本兼容性约束，版本检查逻辑在 `electron/downloaderVersionInfo.mts`。
- 用户当前请求是“检查上游是否有更新，并分析是否有必要更新”，不是立即执行升级。

## Requirements

- 本次评估范围覆盖全部上游相关下载后端组件：`yt-dlp`、`gallery-dl`、`douyin-dl`。
- 识别当前受上游版本影响的下载后端组件，并确认仓库当前锁定版本。
- 核对这些组件上游是否存在比当前锁定版本更晚的发布或可用更新。
- 对每个纳入范围的组件说明：
  - 上游是否有更新；
  - 更新内容的大致性质（修复、兼容性、功能、破坏性变化、发布形态变化）；
  - 结合 Ameow 当前集成方式，是否值得现在跟进。
- 最终结论必须区分“建议更新”“可以暂缓”“暂不建议更新”。

## Acceptance Criteria

- [ ] 明确列出本次评估覆盖的下载后端组件。
- [ ] 明确列出每个组件当前仓库锁定版本与上游最新情况。
- [ ] 给出基于项目现状的更新必要性判断，而不只是版本对比。
- [ ] 结论中指出潜在升级风险或阻塞条件。

## Out Of Scope

- 本次不直接修改版本或提交升级代码。
- 本次不做与下载后端无关的其它依赖巡检。

## Decision

- 本次评估范围覆盖 `yt-dlp`、`gallery-dl`、`douyin-dl` 三个下载后端组件。
