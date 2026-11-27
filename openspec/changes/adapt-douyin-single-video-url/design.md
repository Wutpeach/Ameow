# Design

## Context

动机见 proposal。Generic 对象的 URL 用于去重，实际引擎又读取冻结 intent.url，故规整必须同时作用于两者。现有 yt-dlp Generic 身份使用 URL 哈希，明确抖音目标还需核原生作品 ID。

## Decisions

- 仅对精确 douyin.com / www.douyin.com 和 jingxuan?modal_id、video/ID 进行单作品规整，保留通用公网边界。非默认端口或其他主机不提升为该站点。
- 不新增 Object/Site 枚举，继续沿通用下载器路由；只在明确 Douyin 单作品身份处核对原生 ID 与提取器，保留现有媒体/音轨责任。
- 有限 ID 语法与重复/冲突拒绝在接受边界完成，不以取出第一个查询值解决歧义。
- 先记录原引擎与规范 URL 的真实对照；#98 稳定运行时再做媒体与取消。未成功前不把抖音胶囊注册到页面权限与注入列表。

## Risks / Trade-offs

- 规范链接仍可能被站点要求新会话或受提取器兼容限制 → 保留原错误并报告实际条件，不读取用户浏览器 Cookie。
- 通用对象仍以规范 URL 哈希作为队列身份 → 保持现有协议兼容，同作品 native ID 仅作适配证据核验。
