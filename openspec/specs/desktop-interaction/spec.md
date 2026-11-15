# desktop-interaction Specification

## Purpose

定义 Ameow 原生桌面展示、设置输入、反馈和安全退出的稳定约定。具体视觉 token、资源与组件示例保留为设计参考，正式行为要求仅在 OpenSpec 维护。

## Requirements

### Requirement: 克制且一致的 UI 反馈

界面 SHALL 以对象标题、真实状态、可访问图标动作和就近反馈表达信息，使用既有 Palette、字体、SVG 和容器形状。Full 本体小图标圆底，内部浮窗/设置/托盘普通图标圆角矩形；可见底色与 hit target 分离。只有状态环下方动作按钮保留按钮光晕，普通 Copy/Retry/更新中性处理；不得恢复重复说明、底部临时状态/toast、空队列页或常驻更新等待状态。

#### Scenario: 复制或普通更新操作

- **WHEN** 界面处于失败或更新提示状态
- **THEN** 动作仍遵循其真实语义；复制仅在 OS 成功后原位 check，约 2000ms 恢复，失败保留原因与恢复入口。

### Requirement: 提示与键盘不阻碍操作

Tooltip SHALL 锚定真实 control bounds、优先上方 6px 并约束于窗口，避开鼠标；重复可见文字不重复提示，图标保留可访问名称。点击、键盘、离开窗口或触发控件退役清理提示。队列 SHALL 支持实际 Tab/Shift+Tab 焦点和单次 Enter/Space 激活，不叠加重复激活回调；disabled 行为不能从样式获得权限。

#### Scenario: 用户用 Space 激活 Copy

- **WHEN** 一个有效队列动作获得键盘焦点并收到一次 Space
- **THEN** 只触发一次受权限保护的命令；焦点、tooltip 或 hint 不吞掉正常输入。

### Requirement: 静默准备与准确更新提示

Full SHALL 对健康 warm-cache 自检保持安静，不闪“组件已就绪”；实际下载、安装修复或异常保留进度与恢复入口，本次事实而非历史事件决定可见性。更新图标/版本/动作合成默认中性的整行操作；失败复制位于标题行右侧并保留正常 hit target。活动任务期间由业务 owner 安排结束后更新，简化 UI 不能绕过安全激活门槛。

#### Scenario: 没有当前需要显示的组件或诊断

- **WHEN** 组件健康且不存在实际下载/修复/异常
- **THEN** 不保留空诊断卡、重复复制入口或正常准备提示；后台验证继续。

### Requirement: 设置与目录输入遵守确认权威

设置 SHALL 使用实际持久化 owner，在 SettingsSaved 后才更新已确认值；pending save 的按下和松开均不得打开陈旧目录。不可见 Badge 不消费背景 hit testing。文件/多目录/不存在或不可写目录不产生错误成功确认。目录打开证据 SHALL 验证实际 Explorer 目标，真实设置验证不得用拒绝写入的 preview 模式替代。

#### Scenario: 保存目录等待回执时双击背景

- **WHEN** 新目录尚未确认
- **THEN** 不打开旧 acknowledged 目录；成功或失败后按当前权限恢复正常入口。

### Requirement: 原生窗口与安全退出

关闭请求 SHALL 在首个 snapshot 前保留意图，后续按真实 owner 状态处理。普通退出静默执行安全停止；只有真实清理异常呈现恢复界面，收起/Esc/查看详情不得撤销退出意图或强制释放。程序化显示避免合成 Alt 的 activation 路径；设置首次显示/显式复用以既有非激活方式建立 TOPMOST，自动 focus 限于标题下方内容，保留真实 title drag 与关闭/Tab 行为。不得用定时置顶、全局 hook、手动 move loop 或 toolkit fork 恢复历史失败候选。

#### Scenario: 退出时发生清理异常

- **WHEN** 后端无法证明安全释放
- **THEN** 保留退出意图、准确原因及实际可用重试；不因收起恢复界面而清空意图或确认 stopped。

### Requirement: 动效与现有设计资产分工

普通 UI SHALL 复用原生 ui_motion 的 150ms feedback、180ms enter、110ms exit 和连续反向 easing；Reduced Motion 直接呈现正确终态，休止不持续请求帧。磁吸、Compact/Full 形变和环由各自 owner 管理，普通控件改动不得顺带重调已验收手感。Full/Compact 可见尺寸和 gutter 与 native HWND 边界分别处理，不按网页断点推导未验证的桌面布局。

#### Scenario: 用户快速反向操作或开启减少动态

- **WHEN** 动效尚未完成即反向，或 Reduced Motion 生效
- **THEN** 从当前可见值连续接续或直接到正确终态，不重播、不越界、不改变业务权限。
