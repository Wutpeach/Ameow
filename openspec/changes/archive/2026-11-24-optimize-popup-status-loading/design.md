# Design

## Context

动机见 proposal.md。现行 data-initializing 隐藏整页，直到 tabs.query 和两个状态 Promise 收敛。后台所有 Popup 操作共用同步队列；Sessions.status 每次连接并 ping/list/close，Worker身份报告另用 sendNativeMessage。Rust ping 的完整身份被页面提交和安装验证消费，因此不能全局删减。

## Goals / Non-Goals

**Goals:** 在现有布局内先呈现真实的读取过程；工具和会话独立恢复；减少每次健康读取的进程与哈希成本；交付同输入前后测量及有限隔离回归。

**Non-Goals:** 不引入常驻服务、永久保活、长期私有缓存，不动用户profile/注册表/Cookie，不把页面fixture计时当物理点击或平台根因。

## Decisions

- Popup 初始化只等待同步文案/控件初始化，随后移除整页隐藏。标签页及状态读取各有截止时间；只读状态的错误/重试按各自区域呈现。未收敛的动作/开关不显示授权或OFF事实，使用现有中性色短状态。请求代次隔离迟到结果。
- pages-status 直接读状态而不排在长同步后。status 使用新的本地存储读取和实时 list 响应；如仍需上报既有失败，保留原代次/序号语义。首次 source_id 初始化共享在途初始化，避免身份报告和状态并发创建不同来源。
- Sessions 在单 Worker 内按使用次数共享原生连接，空闲1500ms释放，最长30秒关闭；故障/超时使连接失效。每次状态仍实时 list，不保留会话结果。status 不再发送完整 ping；显式同步、页面提交与安装诊断保留各自需要的完整协议。Worker身份报告仅在该浏览器session首次成功或编译身份变化时发送，失败不记成功；该标记仅包含来源ID和代码哈希。报告保持独立短进程，避免旧Host不支持身份操作时使共享会话连接失败。
- 同时记录源码/二进制身份、Host启动次数、ping/list/hash次数与阶段耗时。Windows完整发行/安装/Ready完整校验不变；完整验证时保留选中Host的文件句柄直到spawn，免除再次打开/验证同一文件及重复清单验签，不引入跨进程信任缓存。与整合者独占mod.rs/store.rs，其他app_update文件不写。

## Risks / Trade-offs

- [读取与同步交错] → 仅并行读路径，来源初始化合并；既有report_failure继续由存储的grant/sequence约束，不允许旧代次覆盖。
- [断连/超时留下坏连接] → 原生transport统一使全部未完成请求失败并关闭，下一次重新连接；没有自动重复授权/写操作。
- [复用延迟Host版本切换] → 连接30秒硬上限及1500ms空闲，未缓存状态或身份验证成功；完整发行校验保留。
- [预览不能覆盖真实浏览器启动] → 独立stdio Host和有限profile隔离各自标清，物理点击到JS仍单列未知。

## Migration Plan

独立worktree交付源码提交与change，由整合者消费主线修复并合并、同步/归档规范、构建根dist与主线验收入口。无需用户数据迁移；回退源码恢复既有读取路径。
