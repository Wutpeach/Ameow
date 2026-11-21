# process-ownership Specification

## Purpose

定义 Windows x64/MSVC 下真实进程树、线程、运行时与工作区的释放条件，以及 macOS 受控调用的结算事实来源，防止退出、取消或超时伪造资源结算。各平台的实际原生验证以对应证据为准，不能互相替代。

## Requirements

### Requirement: macOS 受控调用的结算事实来源

macOS 监督器 SHALL 消费 Adapter 构造的实际调用和 Runtime 已验证租约的工具身份，不另存下载器 argv 配方、环境 recipe 或固定工具 hash。调用绑定不得被其他 executable、参数、环境或工作目录复用；工具更新继续使用 Runtime 认证后的实际材料。

#### Scenario: 已选 yt-dlp 版本执行

- **WHEN** 用户选择的 yt-dlp 版本已经由既有 Runtime 流程验证并取得租约
- **THEN** 推荐版与已选版本共用实际调用及结算入口；监督器不因内嵌旧版 hash 再次否认该身份。Adapter 保留受控同步组件的结算资格和有界记录检查，不能把这类资格当作下载能力判断；未知后代、取消、信号或观察丢失仍保留真实 owner、wait、管道、线程及租约守卫。

#### Scenario: 受控 Transfer 在媒体下载前普通失败

- **WHEN** 已绑定实际调用与受信租约的 yt-dlp Transfer 在 `before_dl` 记录前正常非零退出，例如提取时网络失败
- **THEN** Adapter SHALL 仅在预建的选流及最终文件记录仍为普通空文件、工作区有界检查确认没有 `media.*` 输出时，认定媒体下载尚未开始；监督器仍须证明正常退出、未 reap 根进程时组内仅剩该根、实际 wait 状态一致、连续观察与全部 join，随后让队列报告真实失败并释放 owner/slot。零退出、记录缺失或损坏、已有媒体输出、信号终止及未知后代不得借此路径结算。

### Requirement: 创建时建立进程所有权

监督器 SHALL 使用创建时 JOB_LIST、严格 HANDLE_LIST、挂起成员校验和隐藏执行；MUST NOT 使用先创建再分配 Job 的回退。owner 在操作异常和驱动线程 unwind 后仍保留必要所有权；输出排空不得依赖尽力投递的观察队列。

#### Scenario: 根进程退出但子进程仍活动

- **WHEN** 根进程退出，而后代、pipe reader 或回调 consumer 尚未完成
- **THEN** 保持运行时、工作区及执行 slot 的所有权，不发布已释放终态。

### Requirement: 真实结算屏障

系统 SHALL 在 root wait、已知 Job-zero、两个 reader 和 consumer join、监督驱动 join，以及所拥有文件清理后才允许释放；队列还 SHALL 等待外层执行 owner 的实际 join。kill 请求、EOF、超时、Drop 尝试或返回 Ok/Err 均不能单独证明结算。

#### Scenario: 控制或查询结果不确定

- **WHEN** 控制失败、query 不确定或仍有被占用的 owned 文件
- **THEN** 进入非终态 Held 并保留确切所有权；只有显式重试证明全部屏障完成才能释放。

### Requirement: 区分 live Held 与 owner lost

共享准备线程意外 unwind SHALL 在命令共同模型锁下及时发布 `preparation_owner_lost`，并在清除 live-recipient 信号之前阻止竞态。MUST NOT 将丢失 owner 描述为物理上仍受持有的可重试 Held。受影响等待任务保持非终态且 unreleased；拒绝新 admission 和无接收者的 cleanup retry，不确认 stopped。独立存活执行的 cleanup 权限仍保留。

#### Scenario: 外层准备线程 panic

- **WHEN** unwind 已发生但 dispatcher 尚未 join
- **THEN** cleanup/cancel/submit/stop 不得制造释放终态；新提交返回 `E_RUNTIME_OWNER_LOST`，无幻影重试。

### Requirement: 停止与发布共享真实权威

系统 SHALL 关闭 admission、撤销待执行任务并取消准备及活动执行，等待真实请求返回、所有权结算与外层 join 后才确认停止。发布与取消 SHALL 由同一既有权威仲裁，晚到取消不得删除已提交文件或改写终态。前台 snapshot SHALL 从短持有的 projection 锁取得数据，不等待发布互斥锁或在争用时虚构 Idle。

#### Scenario: 关闭时仍有阻塞请求

- **WHEN** 请求取消后 HTTP 读取仍在等待原有超时及路由/结算开销
- **THEN** 保持停止未完成；不因时限已过而确认安全退出。
