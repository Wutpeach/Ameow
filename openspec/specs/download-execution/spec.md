# download-execution Specification

## Purpose

定义 Ameow 当前下载请求、引擎适配与原生选流的责任边界。覆盖现有 Rust/GPUI 工程，不把历史单站点阶段限制扩展成所有下载器的准入门槛，也不声明所有公网网站可用。

## Requirements

### Requirement: 接受并冻结有效下载意图

系统 SHALL 接受有界、无凭据的公开 HTTP(S) 请求，拒绝本地文件、非公开字面地址及明确的本地域名。接受时 SHALL 冻结对象意图、画质和已有输出目录。已知 YouTube/Bilibili 路径 SHALL 保留单对象/分 P 校验，未知公网地址由下载器判定支持情况，不增加站点白名单。

#### Scenario: 默认设置在任务接受后改变

- **WHEN** 一个请求已经接受，随后保存了新画质或新目录
- **THEN** 原任务继续使用原意图；目录消失时给出存储失败，不替换目的地。

#### Scenario: 对象身份存在歧义

- **WHEN** 已知视频地址携带播放列表、重复 ID、模糊分 P，或后续身份不匹配
- **THEN** 系统拒绝猜测传输；完整 YouTube ID（包括 `_p`）不得按 Bilibili 分 P 语法截断。

### Requirement: 下载器拥有提取和原生选流

系统 SHALL 通过中性 Adapter 传递意图、阶段、进度和产物；composition 选择实际引擎及可信工具需求。提取、原生格式选择、内部恢复、私有协议及错误解析由 Adapter/下载器负责。核心、队列和 GPUI MUST NOT 解析原始引擎 JSON、Format ID 或内部重试计数，不重建 Rust 候选排序、metadata replay、load-info-json 或全体媒体/CDN URL 等值预检。yt-dlp 视频保留现行 MKV 合并/remux 策略与真实传输的 no-simulate；观察选项不允许跳过下载。

#### Scenario: 原生下载器选择媒体

- **WHEN** 选择 Highest、Balanced 或 Saver
- **THEN** yt-dlp Adapter 将意图映射为原生选择器与现行高度优先/同高度 codec 排序；上限分别为不限、1080、480，实际选择仍须通过中性事实验证。

### Requirement: 音轨可选并核对真实媒体

系统 SHALL 允许原生选择的视频没有音轨。`requires_audio` 仅反映原生选择是否包含音轨；独立验证 SHALL 核对所选视频的尺寸、codec、画质上限、有效时长，以及选择了音轨时的实际音轨存在性；记录真实 `audio_present`。不能为“更兼容”额外要求所有视频带音轨，或把测试 Data verifier 用于生产视频。

#### Scenario: 有效视频本身无声

- **WHEN** 原生选择不包含音轨且视频及交付验证通过
- **THEN** 正常交付并记录音轨不存在；所选音轨在交付中丢失则失败。

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
