# Spec Delta

## MODIFIED Requirements

### Requirement: 共用桌面下载权威

普通控制 CLI SHALL 连接当前用户的桌面实例，提供提交、列表、查看、取消、重试和等待。GUI 与普通 CLI SHALL 共用下载内核、任务和组件准备，应用更新期间的命令限制继续有效。不得建立第二套下载业务或独立无界面常驻服务。显式开发构建的有限独立执行遵守 developer-execution 约定，不改变普通控制 CLI 的任务生命期。

#### Scenario: 双向任务控制
- **WHEN** CLI 提交任务后，GUI 取消或重试该任务
- **THEN** CLI 读取同一队列的权威变化及同一任务标识，普通重试的新任务与 Gallery 同任务续作遵循现有规则。
