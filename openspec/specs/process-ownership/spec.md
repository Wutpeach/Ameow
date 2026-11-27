# process-ownership Specification

## Purpose

定义 Windows x64/MSVC 下真实进程树、线程、运行时与工作区的释放条件，以及 macOS 受控调用的结算事实来源，防止退出、取消或超时伪造资源结算。各平台的实际原生验证以对应证据为准，不能互相替代。

## Requirements

### Requirement: macOS 受控调用的结算事实来源

macOS 监督器 SHALL 消费 Adapter 构造的实际调用和 Runtime 已验证租约的工具身份，不另存下载器 argv 配方、环境 recipe 或固定工具 hash。调用绑定不得被其他 executable、参数、环境或工作目录复用；工具更新继续使用 Runtime 认证后的实际材料。Transfer 取消 SHALL 使用独立于成功交付的本次取消完成证明，并保留连续观察、未回收根的组证明、真实 wait、全部 join 和文件清理屏障。

#### Scenario: 已选 yt-dlp 版本执行

- **WHEN** 用户选择的 yt-dlp 版本已经由既有 Runtime 流程验证并取得租约
- **THEN** 推荐版与已选版本共用实际调用及结算入口；监督器不因内嵌旧版 hash 再次否认该身份。Adapter 保留受控同步组件的结算资格和有界记录检查，不能把这类资格当作下载能力判断；未知后代、信号或观察丢失仍保留真实 owner、wait、管道、线程及租约守卫。取消必须另有本次取消完成证明，不能从任意非零退出推断完成。

#### Scenario: 受控 Transfer 在媒体下载前普通失败

- **WHEN** 已绑定实际调用与受信租约的 yt-dlp Transfer 在 before_dl 记录前正常非零退出，例如提取时网络失败
- **THEN** Adapter SHALL 仅在预建的选流及最终文件记录仍为普通空文件、工作区有界检查确认没有 media.* 输出时，认定媒体下载尚未开始；监督器仍须证明正常退出、未 reap 根进程时组内仅剩该根、实际 wait 状态一致、连续观察与全部 join，随后让队列报告真实失败并释放 owner/slot。零退出、记录缺失或损坏、已有媒体输出、信号终止及未知后代不得借此路径结算。

#### Scenario: 受信 Resolve 响应取消后正常退出

- **WHEN** 绑定实际调用及已验证租约的 yt-dlp Resolve 收到取消，仍持有未回收根进程、尚未取得正常退出证明，且没有清理故障或观察丢失
- **THEN** 监督器 SHALL 仅向该根发送一次 SIGINT，给予最多两秒的正常完成机会，不重置或无限延长；中断请求本身不证明释放。仅在既有正常退出、未 reap 根时组内仅剩该根、wait 状态一致、受控调用合同、reader/consumer/驱动及外层 owner 全部 join 和文件清理屏障成立后，队列才沿此完成路径结算 Cancelled 并释放 slot。超时转既有强制清理，必要组终止须在根 wait 前保留组身份锚；信号终止不得充当正常完成证明，未证明后代结清、观察丢失或未完成屏障继续 Held。未受信调用和缺少独立取消合同的 Transfer 不获该资格。

#### Scenario: 受信 Transfer 完成受控取消

- **WHEN** 具有本次独立取消合同的受管 yt-dlp Transfer 收到取消，且仍持有根、观察连续、没有清理故障
- **THEN** 监督器 SHALL 仅向根发送一次 SIGINT，给予最多十五秒的协作停止机会，重复取消和清理重试不得重置期限。驱动只有在实际收到取消、封闭新工作创建、所有 Python 工作线程实际结束及所有直接子进程经真实父子 wait 结算后，才可产生本次调用绑定的取消记录并正常退出。内核无剩余直接子进程、取消记录或指定退出码各自都不是全部后代释放证明；监督器仍须取得未 reap 根时组内仅根、正常退出与 wait 一致、受控同步工具拓扑和全部原屏障，才结算 Cancelled、slot=false、resources_released=true，并允许正常退出。

#### Scenario: 取消证明缺失或实际成员仍未结算

- **WHEN** 取消遇到存活 child、未结束 worker、未知派生、独立 session/group、观察丢失、非正常根退出、wait 不一致，或取消记录缺失、损坏、超限、非普通文件、旧调用或错误 root
- **THEN** 系统 MUST NOT 通过清状态、进程缺席、EOF、已发送信号、超时或重试次数制造取消完成。机会耗尽沿原强制清理推进，必要组终止仍在 root wait 前持有组身份锚；无法证明全部屏障时继续 Held 并保留真实所有权。

#### Scenario: 部分输出与成功完成竞争

- **WHEN** Transfer 取消时已有部分媒体或晚到的成功媒体记录
- **THEN** 取消完成证明 SHALL 只用于所有权收尾，不替代媒体身份、完整性及成功交付验证。正常媒体完成抢先且根正常零退出时，原完整媒体合同仍可证明所有权结算；取消非零退出缺少取消证明时不得借媒体记录补过。未发布的部分输出保留在本次自有工作区，全部 join 后经原清理屏障处理；不得删除已提交文件、用户其他下载或其他任务文件。成功发布与取消继续由既有共同权威仲裁，晚到取消不得改写已提交终态。

#### Scenario: 新子进程在创建登记窗口收到取消

- **WHEN** SIGINT 落在实际创建子进程之后、语言对象登记或构造完成之前
- **THEN** 系统 SHALL 依据真实父子 wait 和后代证明而非对象列表空值判断结算；任何仍未等待或归属不明的成员阻止取消完成记录与资源释放。

### Requirement: 创建时建立进程所有权

监督器 SHALL 使用创建时 JOB_LIST、严格 HANDLE_LIST、挂起成员校验和隐藏执行；MUST NOT 使用先创建再分配 Job 的回退。owner 在操作异常和驱动线程 unwind 后仍保留必要所有权；输出排空不得依赖尽力投递的观察队列。

#### Scenario: 根进程退出但子进程仍活动

- **WHEN** 根进程退出，而后代、pipe reader 或回调 consumer 尚未完成
- **THEN** 保持运行时、工作区及执行 slot 的所有权，不发布已释放终态。

### Requirement: 真实结算屏障

系统 SHALL 在 root wait、已知 Job-zero、两个 reader 和 consumer join、监督驱动 join，以及所拥有文件清理后才允许释放；队列还 SHALL 等待外层执行 owner 的实际 join。kill 请求、EOF、超时、Drop 尝试或返回 Ok/Err 均不能单独证明结算。

#### Scenario: 控制或查询结果不确定

- **WHEN** 控制失败、query 不确定或仍有被占用的 owned 文件
- **THEN** 进入非终态 Held 并保留确切所有权；只有显式重试或 Windows 首次取消触发的一次有界清理推进证明全部屏障完成才能释放。

### Requirement: Windows Held 的一次取消推进

Windows live owner 已处于 Held 时，首次取消 SHALL 启动一次有界、幂等的既有清理推进。控制失败或成员未知时 SHALL 保留真实 owner、slot 与 Held，并提供显式重试；重复取消 MUST NOT 形成无限自动重试或释放终态。推进继续遵守 root wait、Job-zero、reader、consumer、驱动及外层 owner join 屏障，不影响其他任务的 Job。

#### Scenario: Held 写入器收到取消

- **WHEN** 查询故障导致存活写入器进入 Held，随后故障解除且用户首次取消
- **THEN** 取消启动真实终止与清理，结算后停止新增文件，仅发布一个真实终态并在所有 join 后释放 slot。

#### Scenario: 取消推进仍然失败

- **WHEN** 首次取消的清理推进仍遇到控制或查询故障
- **THEN** 保留 Held 和所有权，重复取消不继续自动推进；显式重试可再次尝试并在实际完成后结算。

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
