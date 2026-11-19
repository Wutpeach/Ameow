# Spec Delta

## ADDED Requirements

### Requirement: attempt 认证快照一致

已授权站点的下载 SHALL 在每次 attempt 取得独立受控 CookieJar，metadata、选流、transfer、内部重试和 Adapter 后备共用该快照；用户显式重试在有效授权下取得新快照并重新解析。MUST NOT 将用户源副本交给后端回写、使用全局 Cookie 头、取消 ignore-config、恢复 ambient 配置/PATH 或自行解密浏览器数据库。域、path、secure、HttpOnly、过期及会话 Cookie SHALL 保持原生 Jar 语义。

#### Scenario: 同步发生于两阶段之间
- **WHEN** 已开始的解析完成后浏览器刷新 Cookie
- **THEN** 本 attempt 继续使用原快照，之后显式重试可使用新快照；后端写入不改变保存的浏览器来源。

#### Scenario: 未授权目标
- **WHEN** 提交的站点没有有效授权
- **THEN** 沿现有匿名下载尝试，由实际下载器判断支持性与选流。

### Requirement: 认证输出隐私与原有失败交互

凭据 MUST NOT 经认证响应标题等自由元数据进入业务快照、公开 identity 标签或交付路径/文件名，也不得进入 argv、持久化 metadata/info、stderr、诊断或 evidence；下载器原始输出仅在受限执行中用于解析，保留证据使用安全字段。失败 SHALL 沿既有失败状态与可复制脱敏诊断处理，MUST NOT 增加登录连接引导、失败卡授权按钮、专用授权弹窗、授权后自动重试链或替代教程；扩展和设置保留主动入口。

#### Scenario: 下载器输出含认证内容
- **WHEN** 下载器在 metadata 或错误中回显 Cookie 或 Authorization
- **THEN** 安全分类与既有失败复制仍可用，原文不进入持久诊断和 evidence，用户仍通过原有显式重试操作。

#### Scenario: 认证响应把会话值回显为媒体名称
- **WHEN** 认证媒体标题或原生命名字段含当前 attempt 的会话值，包括跨越标题截断边界的值
- **THEN** 在公开身份、快照与交付命名前完成凭据保护；正常媒体标题继续保留，原生内部字段不因公开标签清理而改变身份核验。
