# progress-presentation Specification

## Purpose

定义从真实下载观察到圆环、队列行及离线预览的展示边界。正式要求采用后续 primary-progress 和固定轨道规则，保留当前实现证据与最终用户验收的区别。

## Requirements

### Requirement: 真实 primary 进度

系统 SHALL 选择一个明确识别的视频 primary 或唯一媒体流，优先真实 exact total；原生估算必须是非零、至多 2^53、至少已下载字节且不矛盾的整数，并展示 approximate 来源。缺失/模糊/过期/fragmented 事实保持未知。事实新鲜期为 2 秒，preterminal 最多 99%；音频、合并、验证和保存不制造第二个百分比环或完成。220ms ease-out 跟随真实目标并允许向下修正；同 Job 事实恢复不得虚构 0%。

#### Scenario: 视频完成后继续音频及处理

- **WHEN** primary 已完成而音频或处理仍在继续
- **THEN** 显示真实中性阶段，移除过时百分比；只有独立验证和交付成功才显示完成。

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
