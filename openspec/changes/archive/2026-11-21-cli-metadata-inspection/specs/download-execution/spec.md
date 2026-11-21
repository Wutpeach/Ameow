## ADDED Requirements

### Requirement: 只解析使用正式执行与认证资源

只解析 SHALL 复用正式 URL/对象身份、yt-dlp 原生解析与单质量选流、受管 runtime 租约、attempt 认证快照与撤销观察和真实清理屏障。默认成品保存目录不可用 SHALL 不阻挡只解析。首期仅支持单作品，拒绝集合，不进入 transfer、媒体验证或发布。成功 SHALL 使用 Inspected，不能冒充下载 Success。解析可联网和生成临时文件，不承诺网络硬预算。

#### Scenario: 正式授权域只解析
- **WHEN** 指定 owner 的目标站点已有正式授权
- **THEN** 使用该域的独立 attempt CookieJar，不复制 Store，不导出凭据；撤销取消当次执行，结束后清理 owned workspace 和 Jar 并确认资源释放。

#### Scenario: 无授权与准备失败
- **WHEN** 目标站点无授权或共享 runtime 尚未准备完成
- **THEN** 无授权沿正式匿名边界；准备状态可观察，准备失败报告真实阶段与类别，不借用其他域或把未完成准备描述为解析成功。

### Requirement: 有界安全解析摘要

解析结果 SHALL 仅包含不含自由标题的已验证对象身份、可得时长、尺寸、codec、音轨、当次原生所选媒体及大小或估计与来源。未知字段 SHALL 保持 unknown/null；选择摘要最多八条。不输出完整格式清单、原始 JSON、凭据、header、签名媒体地址或任意原生自由字符串。解析预测不代表未来 transfer 结果或可交付成品。

#### Scenario: 原生字段未知或含秘密
- **WHEN** 原生元数据缺少大小、codec 或回显当前会话内容
- **THEN** 未知值不变成零或无音轨；凭据保护先于公开身份投影，摘要仅保留有界 typed 测量。
