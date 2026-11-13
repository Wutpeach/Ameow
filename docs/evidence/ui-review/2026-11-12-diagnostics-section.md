# 固定诊断信息区与组件升级整行按钮

日期：2026-11-12。用户已授权实施本轮讨论方案：升级采用图标、目标版本和操作文字；移除检查时间尾注；合并组件页随状态在顶部/底部切换的诊断入口。本记录为未提交实现与工程检查，原生验收待用户完成。

## 实现

- 版本弹窗中的升级入口为一个完整按钮：左侧更新图标与目标版本，右侧“升级”。整行提供中性悬停、按下及键盘焦点反馈，完整目标版本保留在可访问名称和悬停说明中。继续调用原版本新鲜度校验及升级命令，不改变后台安装或激活门槛。
- 删除“刚刚检查 / 上次检查”尾注及其时间格式化函数，清除对应过时测试。查询时间仍用于原有新鲜度校验；检查中、冷却及请求失败的有效反馈保留。
- 四项组件列表后固定显示“诊断信息”分区，版本列表末尾的分隔线与区块间距形成边界。标题右侧始终为同一个复制诊断按钮，保留复制中禁用、成功对勾及失败提示。
- 准备、更新、等待、失败、回退及操作未受理等提示放在此分区内，重试入口跟随状态提示。移除按状态将整个诊断区域移到组件列表上方的分支；提示条内不再重复放复制按钮。正常情况下只显示诊断标题与复制图标，不撑出空卡片。
- 对应 Gallery 场景继续使用相同组件；更新相关描述，没有新增产品状态或预览场景。

## 集中验证

- cargo test --locked --bin ameow --quiet：160 passed、0 failed、2 ignored（原生桌面相关）；较前轮少一项的原因是删除不再使用的检查时间格式化及其专属测试。
- python -m unittest discover -s scripts -p test_gallery_tools.py：7 项通过，无桌面操作。
- git diff --check（本轮相关文件）：通过。
- cargo build --locked --bin ameow：通过。
- gallery.catalog 无窗口读取最终 EXE：112 个场景，与 scripts/preview-scenes.json 完全一致，包含升级、检查失败、回退及诊断复制反馈的现有场景。

产物：D:/Ameow/target/debug/ameow.exe

SHA256：b51919125b9abcf7d8b67280f1faa799ac1fbf0ee21f360776a0eefb10c1e3c6

## 原生验收

重新打开新版 Gallery，查看 components.update-available、components.check-failed、components.ready、components.restored、components.update-waiting、diagnostics.copying/copied/copy-failed，确认浅深色、升级整行交互、诊断分区位置、单一复制入口及状态换行。Gallery 隔离真实命令，真实复制和升级仍需在正常运行时验收。

本轮未使用 computer 或打开原生窗口，工程检查不构成视觉/点击验收通过。未提交、未推送。
