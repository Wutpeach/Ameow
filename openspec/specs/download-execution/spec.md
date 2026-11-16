# download-execution Specification

## Purpose

定义 Ameow 当前下载请求、引擎适配与原生选流的责任边界。覆盖现有 Rust/GPUI 工程，不把历史单站点阶段限制扩展成所有下载器的准入门槛，也不声明所有公网网站可用。

## Requirements

### Requirement: 接受并冻结有效下载意图

系统 SHALL 接受有界、无凭据的公开 HTTP(S) 请求，拒绝本地文件、非公开字面地址及明确的本地域名。接受时 SHALL 冻结对象意图、画质和已有输出目录。专用 URL 识别未命中时 SHALL 交实际下载器解析，不以旧站点路径、追踪参数或原生规范化地址与输入拼法不同而判断不支持；明确单作品、重复 ID、分 P 和去重意图仍 SHALL 保留。

#### Scenario: 默认设置在任务接受后改变

- **WHEN** 一个请求已经接受，随后保存了新画质或新目录
- **THEN** 原任务继续使用原意图；目录消失时给出存储失败，不替换目的地。

#### Scenario: 对象身份存在歧义

- **WHEN** 已知视频地址携带明确的集合意图、重复 ID、模糊分 P，或后续身份不匹配
- **THEN** 系统拒绝猜测传输；完整 YouTube ID（包括 `_p`）不得按 Bilibili 分 P 语法截断。

#### Scenario: 专用 URL 识别未命中

- **WHEN** 安全公开链接未匹配内建站点语法，或下载器报告了其规范化地址
- **THEN** 交实际下载器判断支持情况并保留原生对象身份，不因 URL 拼法或缺少标题提前拒绝。

### Requirement: 下载器拥有提取和原生选流

系统 SHALL 通过中性 Adapter 传递意图、阶段、进度和产物；composition 选择实际引擎及可信工具需求。提取、支持性、格式选择、内部恢复、私有协议及错误解析由实际下载器负责；MUST NOT 用未知媒体字段、固定图库元数据形状、扩展名白名单或成功执行的警告重做能力判断。核心、队列和 GPUI MUST NOT 解析原始引擎 JSON、Format ID 或内部重试计数，不重建候选排序、metadata replay、load-info-json 或全体 CDN 等值预检。yt-dlp 视频保留现行 MKV 合并/remux 与真实传输的 no-simulate；观察选项 MUST NOT 跳过下载。

#### Scenario: 原生下载器选择媒体

- **WHEN** 选择 Highest、Balanced 或 Saver
- **THEN** yt-dlp Adapter 将意图映射为原生选择器与现行高度优先/同高度 codec 排序；上限分别为不限、1080、480，源字段未知时继续传输，实际成品再核对冻结上限。

#### Scenario: 图库成功但存在警告或不同元数据形状

- **WHEN** 下载器成功执行并提供完整产物记录，存在 stderr 警告或可选字段未知
- **THEN** 继续按实际图片或视频核验，警告和可选观察不冒充原生失败；真实原生错误、产品范围和不安全路径仍分别报告。

### Requirement: 音轨可选并核对真实媒体

系统 SHALL 允许原生选择的视频没有音轨；源 codec、尺寸、音轨和标题 SHALL 作为可选观察，不得因缺失而提前判定不可下载或阻止资源结算。requires_audio 仅反映已知原生选择，系统 SHALL 记录真实 audio_present。独立验证 SHALL 按实际媒体类型、可用尺寸、codec、音轨和时长证据核对成品与冻结画质；已知选中音轨丢失、实际超上限或损坏媒体仍 SHALL 失败。缺少单一时长字段 SHALL 寻找其他有效证据，验证证据不足与实际坏媒体 SHALL 分别报告。MUST NOT 用测试 Data verifier 替代生产媒体核验。

#### Scenario: 有效视频本身无声

- **WHEN** 原生选择不包含音轨且视频及交付验证通过
- **THEN** 正常交付并记录音轨不存在；所选音轨在交付中丢失则失败。

#### Scenario: 源元数据未知且成品有效

- **WHEN** 原生选择未报告 codec、height 或 audio，或 ffprobe 未报告单一 format.duration
- **THEN** 不提前拒绝，使用实际文件和其他有效证据核验；证据不足如实报告，真实进程及文件资源仍按既有结算条件释放。

### Requirement: 有界完整证据与中性产物

系统 SHALL 拒绝截断的 resolve/probe JSON，保留 resolve 16 MiB、transfer stdout 4 MiB/stderr 1 MiB 的有界捕获和独立排空。yt-dlp 最终记录 SHALL 在独占预留文件中、进程真实结算后读取，最多 4096 字节且恰好一条完整记录；记录、exit 0 和百分比都不具备成功权威。产物 SHALL 为受限工作区内非空、普通、非 reparse 文件，媒体类型匹配注册 verifier。原始诊断 resolve 文件最多 16 MiB、其他文件最多 8 MiB、总量 64 MiB，超限只保留有限摘要；复制给用户的诊断遵守队列隐私规则。

#### Scenario: 观察输出丢失但最终记录有效

- **WHEN** 可选进度输出被丢弃或截断，而独立最终记录完整
- **THEN** 继续身份、真实媒体、哈希及安全交付验证；不凭残缺记录猜测成功。

### Requirement: 保持受支持的有效网络路由

系统 SHALL 对运行时获取的每个 HTTPS 请求及重定向解析 Windows 路由；引擎 SHALL 在隔离环境中显式使用可表示的静态有效路由。与接受来源无关的 bypass 不拒绝该来源；匹配来源的 bypass、PAC/自动配置、带凭据或不支持的代理、含糊的分 scheme 路由保持关闭式拒绝。MUST NOT 在失败后隐式直连，也不声称覆盖所有动态请求或 PAC。

#### Scenario: 引擎网络错误

- **WHEN** 下载器在同一次执行中处理 HTTP/连接错误
- **THEN** 系统保留该执行与 slot，等待真实结算；最终错误通过有证据的安全分类报告，未证明的代理/认证原因保持未知。
