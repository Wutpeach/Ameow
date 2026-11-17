# Design

## Context

见 proposal.md。Windows 基线为 03c8fa53；原工作树保持。Mac 124f3720 另有未提交适配，不能覆盖。现有 Adapter 已使用实际原生选择和独立交付，但元数据验收过严。

## Goals / Non-Goals

保留现有队列、受管运行时、监督器和无覆盖发布。仅传递用户意图和可选观察，成品按类型验证。保持 Generic 单媒体、已识别图库的有界集合及显式续作；不新增纯音频、任意文件或无限集合。

## Decisions

- VideoExpectation 的高度与 codec 改为可选；音轨仅有明确选中证据时要求存在。所有 resolve、before_dl、进度和最终记录调用同时收敛，实际 ffprobe 高度控制 cap。
- 使用原生选择器表达画质并允许未知源高度继续尝试；不重建格式候选。已知矛盾在成品阶段报告。
- Generic 身份冻结输入 URL 哈希，原生 extractor/ID 提供额外去重 alias，标题回退；允许原生规范化 URL 与输入不同。已知对象仍核对 ID/分 P，解析与传输的明确原生身份矛盾仍拒绝。
- 图库只解析完整原生消息列表和真实错误，保留实际数量上限；去掉站点私有对象结构、媒体源和可选 type/count 判断。通过原生 metadata-path 记录真实文件路径，避免按源扩展名推测成品。固定工具版本 v1.32.19 的 DataJob/PathfmtProxy 已只读核对。
- 图库产物由现有 verifier 按真实文件类型分派，图片仍真实解码，视频仍核对实际尺寸/音轨/cap；不把视频作为图片或无验证 Data 发布。
- ffprobe 时长先查 format/stream 证据；缺失时用受管解码证据核对，分别报告明确坏媒体与证据不足。资源结算不依赖媒体字段。

## Risks / Trade-offs

- 原生解析成功仍可能传输失败：错误保留原生归属，不泛化自动回退。
- 删除可选 metadata 等式会减少前置拒绝：受控路径、真实类型、同对象、哈希和发布保护保留。
- 图库未知扩展名或规范化可能改变真实文件名：使用原生最终路径记录并保持集合续作的原生项目身份。
- Mac 存在平台适配差异：交付完整提交及依赖清单，不直接 cherry-pick 或覆盖 Mac。特别包括旧 Core 的 requires_audio 硬门槛与后续 contract/output 命名依赖。

## Migration Plan

在独立分支完成实现与定向回归、Windows 产品路径验证，提交源码和规范并生成补丁。来源负责 GitHub 与 Mac 协调，未授权合并或发行。
