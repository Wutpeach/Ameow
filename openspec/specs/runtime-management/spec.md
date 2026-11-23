# runtime-management Specification

## Purpose

定义可信运行时准备、隔离租约、共享准备状态与用户选择 yt-dlp 更新的当前边界，合并嵌入基线及 T04 的显式更新例外。

## Requirements

### Requirement: 可信不可变运行时与隔离环境

系统 SHALL 通过编译时可信 requirement 集、完整哈希、完成 marker、受监督版本探测和防替换文件 guard 验证租约。通用 Runtime MUST NOT 依赖 downloader 私有文件名分支；生产不接受用户/元数据构造的工具清单，不使用系统 Python/PATH、环境插件/配置、remote EJS 或原地更新。子进程使用 owned home/temp、空 PATH 和可信 composition 提供的工具 recipe，拒绝基准环境键覆盖、重复键和路径逃逸。

#### Scenario: 缓存被破坏或工具未声明

- **WHEN** marker/hash/probe 不一致、租约身份混用或请求未声明的工具
- **THEN** 拒绝执行，保留原缓存，不以 ambient 工具或覆盖修复回退。

### Requirement: 共享启动准备与真实缓存复用

初始化后系统 SHALL 独立启动一次共享准备，不消耗媒体 slot。等待任务保留原 ID、意图和 FIFO；准备失败依靠显式共享 Retry，禁止自动循环。live Held、owner lost、stopping 或已有 retry 拒绝普通 Retry；live 共享 Held 的 `RetryCleanup(0)` 与普通重试分离。缓存 SHALL 在网络分支前验证；修复通过不可变 sibling 无覆盖发布，不删除用户缓存以制造冷启动证据。128 个根条目的候选发现上限不构成任意目录的无条件零网络保证。

#### Scenario: 准备失败后用户重试

- **WHEN** 共享准备 Failed、owner 仍可正常重试且用户显式操作
- **THEN** 同一批等待任务继续等待该准备并在 Ready 后按 FIFO3 执行，而非为每个任务自动重建准备。

### Requirement: 有界准备进度与安全历史

准备 SHALL 报告实际写入字节、可信总量及 typed component/stage/category；未知总量保持不确定，Ready 要求完整验证与发布。安全历史最多 96 条 typed events，优先保留失败；显式重试保留先前失败，原子历史文件读取至多 65537 字节，复制至多 4096 ASCII 字节，历史 queue-runtime-events.log 保留。MUST NOT 从持久化历史恢复 Job、Ready 或所有权，不复制原始 stderr、URL、凭据或私有路径。存储不可写可以使持久化失败，但不能抹掉本会话已观察失败。

#### Scenario: 正常 warm-cache 自检

- **WHEN** 本次只进行健康缓存校验和本地版本检测
- **THEN** 后端照常验证；展示遵循 desktop-interaction 的静默启动规则，不由过去下载/失败记录触发提示。

### Requirement: 用户显式发现与安全激活引擎版本

系统 SHALL 仅在用户请求时查询 PyPI stable 元数据，排除 prerelease/yanked/不一致数据；发现不安装，准备候选需要对新版本的明确确认。候选 SHALL 通过受限 HTTPS 的官方版本化 Release checksum、哈希和精确 supervised version 验证。嵌入 manifest 与其他依赖保持 pinned。激活/Restore SHALL 等待零活动 slot、准备/执行 owner join、无 Held/owner lost 且未 stop；不得杀下载或覆盖活动工具。

#### Scenario: 持久化用户选择失败

- **WHEN** 新 `follow_ameow` 或 `user_selected` 意图未能原子落盘
- **THEN** 保留旧选择与验证租约，不发布新有效 policy；版本大小不能替代用户意图。

### Requirement: 已选版本离线认证与恢复

重启选定 yt-dlp SHALL 验证缓存的官方 checksum 及其 detached 签名、编译 RSA pin、执行文件哈希与精确版本。有效签名缓存无需网络；旧缓存缺 proof 需要一次在线 bootstrap。无效 proof、缺失/损坏执行文件或无确认身份 SHALL 关闭式失败，不静默获取别的 runtime；没有当前验证租约时不能获取可执行/依赖资产。显式 Restore 复用健康推荐缓存并保留旧目录，本地复制/probe 只显示 Preparing/Verifying。

#### Scenario: 不受支持的签名或密钥变化

- **WHEN** proof 不属于支持的 v4 binary RSA/SHA-512 形式，或出现未知格式/关键子包/过期子包/密钥变化
- **THEN** 拒绝认证；pin 变化需要可信 Ameow 更新。离线校验不承诺发现后续吊销或阻止旧 authentic 本地选择重放。

### Requirement: 完成标记发布与可信失败复用

运行时准备 SHALL 在新的不可变目录内完成获取、整套文件验证与必要的受监督探测，再无覆盖发布完成标记文件；MUST NOT 在运行探测后通过移动整个依赖目录发布。失败或取消不得返回 Ready；原缓存不得覆盖。可信包和文件 SHALL 保留在可识别、有界的受管候选内，显式重试在重新验证后复用文件或包，只获取缺失项所需的固定资产。坏包、缺失文件、残留 marker 和历史本身不得构成可信租约。锁、防替换 guard、取消与资源结算边界继续适用。

#### Scenario: 探测后发布失败再重试

- **WHEN** 必要探测已经通过但完成标记发布失败，随后用户显式重试
- **THEN** 保留原始失败及可信包和文件，重试无需再次获取已有可信输入，仍须完成当前准备验证及发布才 Ready。

#### Scenario: 单项缺失或包已损坏

- **WHEN** 某工具缺失而同包其他工具可信，或候选包长度/哈希不匹配
- **THEN** 复用可信工具，只补缺项，坏包不得用于解压或执行，已有候选保持原样。

#### Scenario: 取消或候选达到保留上限

- **WHEN** 获取、解压、探测或标记发布前收到取消，或保留候选已到上限
- **THEN** 安全停止并结算本次资源，不发布 Ready，不无限新建候选或自动循环重试。

### Requirement: 具体且安全的准备失败诊断

准备失败 SHALL 在可得时保留闭集 operation、数值 OS 错误与有效运行时根来源，并贯通安全快照、失败历史和复制出口。旧历史缺少新字段时 SHALL 保持可读且不猜测来源或错误码。诊断继续遵循既有 96 条/65537 字节读取/4096 ASCII 字节复制边界，不包含路径、URL、代理地址、账户或原始 stderr；持久化失败不得抹掉当前内存错误。

#### Scenario: 标记写入或发布被拒绝

- **WHEN** 系统返回具体标记操作的访问拒绝或共享冲突
- **THEN** 历史和复制保留实际操作与实际数值错误码，区分根来源，不把 permission 或成功恢复解释为已证实特定软件、句柄泄漏或安装盘根因。
