# Tasks

## 1. 隔离机制验证与驱动

- [x] 1.1 核实际受管 Python/yt-dlp 的取消、FFmpeg/Deno 子进程 wait 及线程退出路径，形成定向审计回执；在隔离 zipapp 用取消、存活 child/worker、未知派生和创建中断窗口验证取消证明机制。
- [x] 1.2 实现 Adapter 内嵌 Transfer 驱动、一次性调用标识、封闭/线程/真实父子 wait 屏障及独立有界记录；驱动定向测试覆盖成功不变、实际取消、陈旧输出和收尾后新工作不得写证明。

## 2. 合同与监督器整合

- [ ] 2.1 整合精确调用绑定、受信租约工具路径、取消记录校验和一次十五秒 root-only interrupt；Rust 定向测试覆盖缺失/坏/旧记录、错误 root、未发送取消、信号根、wait 不一致、观察丢失、延迟 join 和期限不重置，保留 Resolve 两秒及非受信 Transfer Held。
- [x] 2.2 独立审查最终实现并修正确认问题，按 OpenSpec 同步正式要求，运行 change/spec strict validation；Windows 必要定向构建/测试通过并核两项原 dirty 未变。

## 3. Mac 真实闭环

- [ ] 3.1 在明确新源码的 Mac 开发输入完成推荐/已选 Runtime 的受影响成功/普通失败、真实 HTTP Transfer 及 FFmpeg 活动中取消→slot=false/resources_released=true→正常 quit；保留必要负例、旧失败及 Resolve PASS，记录方法/实际 App 哈希/未知项，不重复 UI 和媒体全矩阵。

## Workflow follow-up

- 全部范围完成并审查后按项目工作流归档本 change；23c4ca22/seq10–11及原失败证据保留。
- 归档后继续本轮已授权的发行工作：稳定并同步最终main，双平台独立干净输入制作新正式候选及新sequence，核签名/成员/hash/实际包体积和受影响包内流程；集中核新SHA的完整CI，更新完整中英发行稿与手册一致上线安排，回主聊供本人最终公开前审阅。此项不因移至归档后的后续步骤而缩减、延后或结束原发行目标。
- 公开 Tag/Publish/feed/站点部署仍等待具体候选和完整发行稿的最终授权。
