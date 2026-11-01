# Ameow Spec 导航

本索引用于定位所需知识，不授权启动任务，也不能代替实现证据；不应一次加载全部规范。

## 产品主线

正常开发主线是 **Ameow Next（Rust / GPUI）**，Electron 实现作为冻结参考。开始前先确认实际工作区、分支、已有改动和获准范围；文档存在并不表示对应实现就在当前工作区。

## 入口

- [Rust / GPUI Next](./rust/index.md)：Rust 工作的默认入口，只读取适用的契约章节。
- [Electron 后端](./backend/index.md)与 [Electron 前端](./frontend/index.md)：冻结参考，仅在历史行为或兼容性确实相关时读取。
- [工程指南](./guides/index.md)：按需使用的思考辅助，不构成产品授权。
- [上下文整理规则](./context-curation.md)：资料保留、来源和知识维护边界。
- [Research 索引](../research/index.md)：历史发现与证据入口，不是当前实现指令。

Linear 负责批准的产品范围、Instruction 和交接；处理 Linear 管理的任务时应确认当前有效记录。实现事实以目标工作区的当前代码、测试及相关运行证据为准；历史报告和旧验收结论不授权新的工作。

## 当前工作区

本工作区包含 `ameow-next/`，是 Rust / GPUI Next 开发工作区。`D:/Ameow` 是单独维护的冻结 Electron 参考，包含额外历史资料；两处 Research 均不能替代对方。
