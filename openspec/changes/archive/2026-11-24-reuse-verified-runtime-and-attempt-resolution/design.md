# Design

## Context

A 的准备接口及 complete.pending→complete.json 无覆盖发布保持不变。已验证缓存目前在 prepare 命中、工具查找、Mac 执行 guard 和 Python 树中重复哈希。#80 的 release/debug 真实计时与源码基线已核；旧微基准仅辅助。

## Decisions

- 新进程对完成标记、清单文件、Python/gallery 内容完整认证后建立租约；可信清单哈希绑定版本，不为重新询问版本启动例行进程。未发布候选、首次获取及实际更新继续必要探测。
- Mac 验证时记录每个已认证路径的设备/inode、类型权限、长度、链接数、uid/gid、纳秒 mtime/ctime；哈希前后检查路径与持有句柄身份一致。树快照含根、目录、文件和符号链接；后续只检查已记录身份，目录变化检测增删，内容变化检测 ctime，替换检测 inode；跨重启绝不复用这些快照。
- 执行用原租约持有的文件句柄复制 guard，继续既有 supervisor 所有权；不增加全局或磁盘缓存。Windows 继续用禁止写入/删除共享的原生句柄。
- E1 以定向替换/同长度写入/还原 mtime/树增删/取消/资源释放测试和少量真实计时交付。E1 bundle 已交接，release 补证在既有目录；E2 未完成前不提前同步其 delta。
- E2 仅在匿名完整解析与身份受理后，把原有受管 resolved.json 作为原生 load-info-json 输入，恢复地址绑定已经核对的 canonical。原生处理格式列表并按冻结意图重新选流；不在 Rust 重建候选排序。
- 每次执行重新获取解析，文件只属当前 owned workspace；打开并持有输入 guard，Mac 同时保存并检查输入身份，复用不跨任务、显式重试、重启或只解析调用。认证仍用既有纯内存 metadata/Jar 路径，不创建秘密输入文件或扩大 stdin 核心接口。
- 已核当前 pinned 引擎的 download_with_info_file：原生输入失败后仅调用一次 download(webpage_url)。保留其原生恢复，不添加 Rust 循环。before_dl 允许当前执行与一次恢复的两条完整有界记录，Mac completion 必须审核全部输入协议，最终记录仍恰好一条；不能只信最后一条放宽所有权。第二次原生选流更新进度源，最终作品/媒体身份照常核对。
- 真实 pinned 引擎夹具发现默认 only_download 会把 HTTP 403 转成非零退出而不触发信息文件恢复；仅复用输入分支显式使用原生 --abort-on-error，使错误进入原生 download_with_info_file 的一次恢复。loopback 健康输入、403 后 canonical 重新提取及取消均已实际结算。
- 复用分支用 after_move 的完整原生观察写入既有 media.info.json，不让失败前的 info-json 在 no-overwrites 下冒充恢复后的最终信息；认证仍只投影安全字段，非复用匿名路径保留原观察。真实媒体与身份核验及保存流程保持原入口。

## Risks and Boundaries

E2 原始输入/观察只存在于 owned workspace。yt-dlp 及组合 Adapter 中对应的 yt-dlp root/primary 诊断清单均排除 resolved/selection/info-json、原始命令、stdout/stderr 和自由错误文本，只保留受控结算及类型化媒体事实；不改队列清理 API。组合清单属于跨 owner 的常量最小协同，需由整合者排写入顺序。

Mac 身份检查仍有路径执行的既有检查至使用间隙；保留 guard 和进程结算，不声称防御同权限恶意进程的所有并发攻击。大量树路径的 stat 仍有成本，实际报告测量而不承诺固定加速。用户体验、Windows 同条件计时未由 Mac 检查替代。
