# Design

## Context

A 的准备接口及 complete.pending→complete.json 无覆盖发布保持不变。已验证缓存目前在 prepare 命中、工具查找、Mac 执行 guard 和 Python 树中重复哈希。#80 的 release/debug 真实计时与源码基线已核；旧微基准仅辅助。

## Decisions

- 新进程对完成标记、清单文件、Python/gallery 内容完整认证后建立租约；可信清单哈希绑定版本，不为重新询问版本启动例行进程。未发布候选、首次获取及实际更新继续必要探测。
- Mac 验证时记录每个已认证路径的设备/inode、类型权限、长度、链接数、uid/gid、纳秒 mtime/ctime；哈希前后检查路径与持有句柄身份一致。树快照含根、目录、文件和符号链接；后续只检查已记录身份，目录变化检测增删，内容变化检测 ctime，替换检测 inode；跨重启绝不复用这些快照。
- 执行用原租约持有的文件句柄复制 guard，继续既有 supervisor 所有权；不增加全局或磁盘缓存。Windows 继续用禁止写入/删除共享的原生句柄。
- E1 以定向替换/同长度写入/还原 mtime/树增删/取消/资源释放测试和少量真实计时交付。E2 单独评估并补 delta，未实现部分不提前同步。

## Risks and Boundaries

Mac 身份检查仍有路径执行的既有检查至使用间隙；保留 guard 和进程结算，不声称防御同权限恶意进程的所有并发攻击。大量树路径的 stat 仍有成本，实际报告测量而不承诺固定加速。用户体验、Windows 同条件计时未由 Mac 检查替代。
