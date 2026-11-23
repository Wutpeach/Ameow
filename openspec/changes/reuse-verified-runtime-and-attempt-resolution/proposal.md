# Proposal

## Why

#80 的真实队列计时表明，两次引擎命令前反复执行相同文件哈希及 Python 全树哈希，发行版每单约 3.15 秒；健康重启还会启动六个只查询版本的进程。今晚已批准按 #89→#80 接力减少这些等待，真实性与资源所有权边界保持有效。

## What Changes

- E1：跨重启完整验证可信文件和依赖树，健康已发布缓存使用与可信哈希绑定的版本，不例行启动版本进程。
- E1：同进程复用持有的验证租约，以文件对象及树中每个路径的身份检查拒绝修改、替换、增删，不反复读取相同内容计算哈希。
- 首次获取、实际更新、未完成候选恢复仍保留完整验证及必要受监督探测；保留 A 的不可变目录内发布完成标记机制。
- E2：候选在匿名同一 yt-dlp attempt 内复用已有解析文件，由原生引擎重新选流；临时地址失效只沿原生同进程重新提取路径恢复，不建持久媒体缓存或 Rust 重试框架。认证原始 metadata 保持纯内存，沿既有路径执行，不宣称其加速。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- runtime-management：明确健康启动及同进程可信租约复用边界。
- download-execution：允许 Adapter 内匿名同 attempt 的原生解析文件输入及有界原生过期恢复，保持原生选流、身份、隐私和资源结算。

## Impact

E1 限定 runtime 验证、Mac Python/gallery 身份、定向测试；不修改 queue、UI、保存链路或依赖版本。E1 已提交 8904764a 并用只依赖指定基线的 bundle 移交；E2 留在 yt-dlp Adapter 及 Mac 同进程完成记录审核，不改变 ProcessSpec/stdin 或 F 的 runtime/queue。Mac 证据不推导 Windows 等幅收益；主规范的同步和归档由整合者串行完成。
