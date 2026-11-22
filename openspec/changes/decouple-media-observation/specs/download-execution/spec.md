## ADDED Requirements

### Requirement: 媒体辅助观测不具有下载否决权

系统 SHALL 将 `resolve-media.json`、`transfer-media.json` 及对应 `primary-*` 仅作为可选安全媒体观测。生成、保存或归档时缺失、写失败、不完整、不可读、非普通文件或复制失败 SHALL 安全省略并在现有安全诊断承载中以固定 resolve/transfer 阶段及 unavailable 表示；MUST NOT 跟随链接、保留错误原文或以提示持久化失败单独否决下载。系统 SHALL 保持 typed 字段投影、现有输入与归档限额、其他证据错误语义、必要原生 metadata/身份/一致性/媒体核验及发布要求；实际清理失败仍 SHALL 保持 Held、显式重试与真实资源结算。

#### Scenario: 辅助记录写失败而原生成品有效

- **WHEN** 匿名或认证 attempt 的 resolve 或 transfer 辅助观测写入失败
- **THEN** 继续必要身份核验、原生传输和独立 verifier；只有原有发布条件通过且资源真实结算后才交付终态，诊断如实标记该阶段 unavailable。

#### Scenario: primary 或最终归档遇到坏辅助文件

- **WHEN** 辅助观测缺失、残缺、内容改变、不可读、成为链接或非普通文件，或复制失败
- **THEN** 安全省略该观测，不归档半文件或错误内容；提示只含固定阶段与 unavailable，提示存储失败不改变业务结果。

#### Scenario: 核心失败与真实清理失败

- **WHEN** 必要原生 metadata 缺失或无效、身份不符、媒体损坏、引擎或核心存储失败，或工作区实际清理失败
- **THEN** 原失败和 Held/重试规则继续适用，不因辅助观测非致命而跳过验证、提前释放 slot 或伪称成功。
