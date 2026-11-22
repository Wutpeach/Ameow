# Design

## Context

见 proposal.md。两个 typed 投影当前用普通写入，错误从 adapter 返回；automatic 随后复制全部证据，最终归档同样读文件。已有 attempt-error.log 是认证安全摘要承载，工作区清理在独立 Held 屏障内。

## Goals / Non-Goals

完整覆盖生成、primary 和最终归档；保留下载器及独立 verifier 的权威。仅对四个固定辅助文件名实行可选策略，不扩大 resolved.json、media.info.json 或其他证据的例外。

## Decisions

- 每次 attempt 维护两阶段观测保存结果及成功内容指纹，ExecutionContext 和 primary 共享，最终归档沿用。用内存事实跳过写失败的半文件，避免通过读取另一个提示文件来判断可用性。
- 生成用独占新建，不覆盖或跟随现有目标；复制仅接受普通非 reparse 文件、完整有界内容及成功写入的相同指纹。源不可用或复制失败只记录固定阶段 unavailable。primary 迁移对应事实，避免同时列出的无前缀名字造成错误缺失判断。
- 复制先完整有界读取，在源 owned workspace 内用临时文件写完再发布到目标，避免半复制内容进入归档；临时文件若无法删除仍走原工作区 Held 清理屏障。生产源/目标同属 runtime 根同卷；跨卷失败只省略，无复制回退。保留原有每文件及总量限额；超限保持省略摘要。
- unavailable 追加到现有 attempt-error.log，最终摘要含归档阶段结果；写提示只尽力而为。不新增 Adapter 业务事件、日志框架或持久重试。诊断目录本身不可写时无法保证持久提示，如实报告限制。
- 原真实资源清理循环保持不变；持续不可清理对象仍 Held，后续显式 cleanup 结算后才释放资源。

## Risks / Trade-offs

- 外部修改或写失败可能留下工作文件 → 指纹/状态阻止归档；由原工作区清理屏障处理，不能为非致命观测吞掉清理错误。
- 认证内容可能回显 → 保留现有 typed 投影，不把 IO 错误、路径、URL 或标题用于提示；复用合成秘密扫描。
- Windows 本地 fixture 不能证明 macOS 实机 → 平台无关检查与自然 CI 补充覆盖，报告保留实际未测范围。

## Migration Plan

在已批准 main 基线直接实现、定向验证、独立只读审查、正常提交推送，并以最终准确 head 的自然 CI 闭环。无数据迁移或版本变更。
