# progress-presentation Specification

## Purpose

定义从真实下载观察到圆环、队列行及离线预览的展示边界。正式要求采用后续 primary-progress 和固定轨道规则，保留当前实现证据与最终用户验收的区别。

## Requirements

### Requirement: 持续取消反馈

点击取消后界面 SHALL 立即显示发送中反馈并抑制重复发送。正式队列受理后 SHALL 以独立取消事实让主浮窗与任务行持续显示“正在取消…”，不能被阶段或进度刷新覆盖。Held SHALL 如实显示清理待确认并保留现有显式重试入口；只有实际停止、清理和外层 owner join 完成才显示已取消。拒绝 SHALL 解除发送状态、恢复仍有效的取消操作，并就近说明未受理原因。

#### Scenario: 受理后继续收到阶段或进度

- **WHEN** 取消已受理且停止或清理仍未结束，后续下载或保存观察到达
- **THEN** 主浮窗和任务行仍呈现取消中，不复活下载百分比或正常下载状态；重复取消不产生重复控制尝试。

#### Scenario: 取消被拒绝

- **WHEN** 通道拒绝、已交付、已终态或没有可用 owner 导致取消未受理
- **THEN** 撤下发送中状态并提供就近原因；仍可取消的任务恢复操作，已交付文件与真实终态保留。

### Requirement: 真实 primary 进度

系统 SHALL 选择一个明确识别的视频 primary 或唯一媒体流，优先真实 exact total；原生估算必须是非零、至多 2^53、至少已下载字节且不矛盾的整数，并展示 approximate 来源。缺失/模糊/过期/fragmented 事实保持未知。事实新鲜期为 2 秒，preterminal 最多 99%；音频、合并、验证和保存不制造第二个百分比环或完成。220ms ease-out 跟随真实目标并允许向下修正；同 Job 事实恢复不得虚构 0%。

#### Scenario: 视频完成后继续音频及处理

- **WHEN** primary 已完成而音频或处理仍在继续
- **THEN** 显示真实中性阶段，移除过时百分比；只有独立验证和交付成功才显示完成。

### Requirement: 真实切片进度与处理倍率

已接受的区间下载 SHALL 使用原生已输出媒体时间相对所选时长呈现切片百分比，并将原生速度显示为处理倍率（×）。输出文件字节不等于网络下载字节，处理倍率不得表示为网络 MB/s。仅启用当前已核对媒体身份的切片观察；沿用有界 framing、200ms 合并、2秒新鲜期和preterminal最多99%。结束、合并、取消、验证及保存 SHALL 撤下数值事实；原生观察缺失或无效保持未知，不制造进度或影响真实交付。

#### Scenario: 切片原生时间连续变化

- **WHEN** 所选8秒区间的原生输出时间由2秒增加到4秒并报告0.7x
- **THEN** 主环和队列显示25%再到50%，速度为切片处理0.7×，没有网络字节或MB/s推断。

#### Scenario: 观察损坏、丢失或过期

- **WHEN** 原生记录不完整、pipe sequence存在缺口、速度未知或样本超过2秒
- **THEN** 丢弃损坏记录，未知/过期的百分比及倍率不显示；认证原始输出不因进度观察落盘。

#### Scenario: 切片结束或取消

- **WHEN** 原生进度结束、进入处理或取消已受理
- **THEN** 数值事实不再作为下载中状态显示；真实进程停止、清理、验证和交付继续由现有结算链路决定。

### Requirement: 观察有界且没有生命周期权威

进度 SHALL 受 Job/attempt/严格更新 revision、phase/cancel/stop 校验；退出阶段、Held 或终态清除旧事实。每 pipe sequence 缺口丢弃部分行，维持既有 2 KiB framing、24 KiB chunk、至多两个所选流及 200ms 普通合并投递。缺失可选观察不得使合法交付失败，percent 或 Merger 标记不得取代结算权威。timeline SHALL 为 create-new、有界 128 channel/8192 scalar records，不含私有原始字段，不阻塞 callbacks。

#### Scenario: 丢包或晚到样本

- **WHEN** 观察存在 sequence gap 或来自旧 attempt/phase
- **THEN** 丢弃损坏/陈旧事实，保持未知或最新有效状态，不拼接猜测或复活进度。

### Requirement: 前台选择与独立展示时钟

GPUI SHALL 选择最新实际取得 start ticket 的 slot-owning Job，等待任务不能抢主环；后台终态不能抢前台。已选择任务 Success hold 1500ms 一次，结束后读取最新 snapshot；队列已打开时看到的 Success 行保留 500ms，关闭期间旧 Success 不重播。滚动退役 SHALL 保留首个仍可见 Job 及其行内 offset；计时不改变后端终态。

#### Scenario: 前台成功而下一任务已开始

- **WHEN** 前台 1500ms hold 结束
- **THEN** 切换到最新实际执行任务的当前进度，不重放等待时快照；队列 500ms 行时钟独立。

### Requirement: 稳定队列布局与可达操作

队列 SHALL 保留 180px 内容、56px 两行布局、按 admission 排序；第一行按 0/1/2/3 个 24px 图标及 2px 间隙分配标题，第二行固定 122px track、4px gap、54px 右对齐状态槽。hover/focus 可复用第二行显示本地化动作名，不移动 track，真实进度仍更新；leave/blur/权限或身份改变后恢复最新状态。长标题仅在原裁剪槽内延迟浏览（700ms/14px 每秒），Reduced Motion/离开/滚动/关闭/替换清理浏览。失败显式 Retry/Copy/Clear，拒绝保留来源，command notice 在第一行 5000ms 后恢复标题，不滚动 notice。

#### Scenario: 动作悬停时真实进度增长

- **WHEN** Cancel hint 保持且同一任务从 34% 更新到 61%
- **THEN** 固定 track 中的 fill 正常增长；离开后恢复最新状态，不恢复陈旧数字。

### Requirement: 队列入口与可见历史

Badge SHALL 计数未完成及仍可见、未清除/重试的失败；普通未完成至少两个才出现，单个可见失败保留红色 1。Badge 使用共用紧凑布局及原 3px 点中心分离，不重新加入撤回的字体测量算法或逐主题偏移。队列标题与非零执行/等待数量胶囊分离；没有可见任务不得进入空队列，清除最后一行后关闭。Compact 不显示下载信息。

#### Scenario: 一个失败被清除且没有其他可见任务

- **WHEN** 用户显式 Clear 最后一行
- **THEN** 关闭队列并撤下入口计数；后台 Failure/诊断与已交付文件保留。

### Requirement: 隔离预览与原生证据

显式 preview SHALL 只构造标明 Fixture 的离线 synthetic transport，不创建 production coordinator/preparation/tray、真实提交、用户设置持久化或真实 clipboard 写入；优先于 production bridge flags。场景切换保持单调 revision 并清除旧展示身份。生产不启用数字场景键；未知进度只在需要且非 Reduced Motion 时请求帧。场景增删 SHALL 同步维护适用 preview scenes。fixture/WM/SendInput、callback cadence、真实网络、GPU present 和用户体验验收必须分别陈述。

#### Scenario: 多次切换预览场景

- **WHEN** 场景已积累 revision/terminal state 后再次切换
- **THEN** 新场景仍刷新且不重放旧 hold；不会写真实下载或设置。
