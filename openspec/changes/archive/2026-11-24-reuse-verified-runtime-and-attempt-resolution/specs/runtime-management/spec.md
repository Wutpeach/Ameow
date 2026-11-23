## MODIFIED Requirements

### Requirement: 可信不可变运行时与隔离环境

系统 SHALL 通过编译时可信 requirement 集、完整哈希、完成 marker 和防替换文件 guard 验证租约。首次获取、真实依赖更新及未完成候选恢复 SHALL 保留必要受监督版本探测；健康已发布缓存跨重启完整认证后 SHALL 复用与可信哈希绑定的版本，不例行重启工具查询版本。同进程 SHALL 复用持有且身份仍一致的已验证文件及依赖树，不重复完整哈希；身份变化 MUST 拒绝执行。跨重启 MUST NOT 仅信 marker、路径或 mtime/size。通用 Runtime MUST NOT 依赖 downloader 私有文件名分支；生产不接受用户/元数据构造的工具清单，不使用系统 Python/PATH、环境插件/配置、remote EJS 或原地更新。子进程使用 owned home/temp、空 PATH 和可信 composition 提供的工具 recipe，拒绝基准环境键覆盖、重复键和路径逃逸。

#### Scenario: 缓存被破坏或工具未声明

- **WHEN** marker/hash/必要 probe 不一致、租约身份混用或请求未声明的工具
- **THEN** 拒绝执行，保留原缓存，不以 ambient 工具或覆盖修复回退。

#### Scenario: 健康重启及同进程后续执行

- **WHEN** 已发布缓存跨重启重新完整认证，或同进程继续使用仍持有且身份一致的租约
- **THEN** 健康重启不重复查询可信版本；同进程复用已认证文件和树，仍拒绝同长度写入、恢复 mtime 后的修改、路径替换及树增删。

### Requirement: 有界准备进度与安全历史

准备 SHALL 报告实际写入字节、可信总量及 typed component/stage/category；未知总量保持不确定，Ready 要求完整验证与发布。安全历史最多 96 条 typed events，优先保留失败；显式重试保留先前失败，原子历史文件读取至多 65537 字节，复制至多 4096 ASCII 字节，历史 queue-runtime-events.log 保留。MUST NOT 从持久化历史恢复 Job、Ready 或所有权，不复制原始 stderr、URL、凭据或私有路径。存储不可写可以使持久化失败，但不能抹掉本会话已观察失败。

#### Scenario: 正常 warm-cache 自检

- **WHEN** 本次只进行健康已发布缓存的完整内容认证并复用可信版本
- **THEN** 后端照常验证且不例行启动版本进程；展示遵循 desktop-interaction 的静默启动规则，不由过去下载/失败记录触发提示。

### Requirement: 已选版本离线认证与恢复

重启选定 yt-dlp SHALL 验证缓存的官方 checksum 及其 detached 签名、编译 RSA pin 和执行文件哈希，并复用与认证哈希绑定的精确版本。有效签名缓存无需网络或例行版本进程；旧缓存缺 proof 需要一次在线 bootstrap。首次安装或实际更新选定版本仍须精确受监督版本探测。无效 proof、缺失/损坏执行文件或无确认身份 SHALL 关闭式失败，不静默获取别的 runtime；没有当前验证租约时不能获取可执行/依赖资产。显式 Restore 复用健康推荐缓存并保留旧目录，本地复制/必要 probe 只显示 Preparing/Verifying。

#### Scenario: 不受支持的签名或密钥变化

- **WHEN** proof 不属于支持的 v4 binary RSA/SHA-512 形式，或出现未知格式/关键子包/过期子包/密钥变化
- **THEN** 拒绝认证；pin 变化需要可信 Ameow 更新。离线校验不承诺发现后续吊销或阻止旧 authentic 本地选择重放。
