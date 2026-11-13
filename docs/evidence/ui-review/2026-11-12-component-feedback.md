# 组件弹窗、状态提示条与 Full 更新行

日期：2026-11-12。用户指出组件详情重复、更新操作外露、状态卡留白、处理中/等待提示缺少包装，以及 Full 更新按钮交互底色过窄。本记录为本轮未提交的实现与集中工程检查，原生视觉和点击验收仍待用户完成。

## 实现

- 组件主列表只展示名称与当前版本。版本弹窗收窄为 248px，去掉重复的当前版本、独立推荐版本徽章和多行来源说明，改为“推荐版本 · PyPI / 自选版本 · PyPI”与右侧检查图标。保留有意义的保留版本、目标版本和检查结果；有升级动作时不再额外重复最新版本说明。
- 升级和恢复推荐版本只在版本弹窗内出现，菜单行仍明确显示升级目标版本；原有查询新鲜度、当前版本验证、命令受理和后台安全激活门槛继续适用。检查、升级、恢复的键盘导航同步调整，Esc 仍返回版本入口。弹窗增加窗口边缘 12px 的约束。
- 未准备、准备中、更新中、等待应用、失败与回退等组件状态统一放在紧凑提示条里。复制诊断和可用的重试入口放在标题同一行，取消单独操作行。需要时才增加失败原因或实际已准备字节数；正常版本与来源仍作为资料展示，不额外制造提示状态。更新状态合并到组件状态条，组件列表下方不再裸露更新说明。
- Full 更新行取消弹层公共内边距造成的二次收缩，按钮横向占满自身行，高度至少 36px，内容保留 10px 水平留白；中性悬停、按下与焦点效果覆盖整个按钮。组件说明保留自身 9px 内边距，和更新行之间使用分隔线。默认按钮继续没有常驻彩色背景。
- 新增 components.version-menu 展示普通版本弹窗；components.update-available 默认展开版本弹窗。components.updating/update-waiting 的说明更新为紧凑提示条。其余相关场景直接使用同一套修改后的组件。

## 集中检查

- cargo test --locked --bin ameow --quiet：161 passed、0 failed、2 ignored（原生桌面相关）。
- python -m unittest discover -s scripts -p test_gallery_tools.py：7 项通过，无桌面操作。
- git diff --check（本轮相关文件）：通过。
- cargo build --locked --bin ameow：通过。
- gallery.catalog 无窗口读取最终 EXE：112 个场景，与 scripts/preview-scenes.json 完全一致，包含新版本弹窗及所有相关既有场景。

产物：D:/Ameow/target/debug/ameow.exe

SHA256：7a06dcd0bf0b7902879b48cd4df396b025aea46530e393a94b93466b912e306a

## 用户验收

建议查看 components.version-menu、components.missing、components.update-available、components.updating、components.update-waiting、components.update-failed、full.app-ready、full.app-conflict。确认浅色/深色下弹窗尺寸、提示条换行、操作间距与 Full 悬停/按下底色；用 Tab / Shift+Tab / 上下键 / Esc 检查弹窗导航。Gallery 隔离真实命令，实际升级、恢复、复制和重试仍应在正常运行时验收。

本轮没有使用 computer 或打开原生窗口，没有执行真实更新、下载或重启。工程检查不构成原生外观或点击验收通过。未提交、未推送。
