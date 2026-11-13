# UI 文案精简与按需说明

日期：2026-11-12。用户已确认本轮方向；工程修改和检查完成，原生视觉与交互验收待用户进行。工作位于现有 main 工作区，尚未提交；同一工作区已有其他 UI 审查改动，本记录只描述文案精简部分。

## 本轮调整

- 设置主区删除与侧栏重复的常规、下载、组件与诊断、关于标题；第三方许可独立子页面保留定位标题，删除介绍句。
- 下载位置区分读取中、真实路径和读取失败。失败时显示短错误，详情通过信息图标查看；仅真实路径提供复制按钮，成功反馈在原按钮上显示对勾。保存、打开和访问失败继续可见。
- 更新开关旁提供信息图标，沿用已有 tooltip 和锚定弹层；实现悬停说明、点击展开、键盘焦点展开、Escape、焦点离开、点击外部、滚动和切页关闭。上述运行时交互尚待原生验收。
- 组件页删除介绍句和正常状态下重复的诊断标题；复制中和已复制在原按钮呈现，失败和恢复操作继续显示。
- 队列标题缩为“队列”，活动与等待统计并入头部，零值省略；删除 Fixture 和终端操作说明。任务行高、标题、进度轨道、状态及第二行悬停操作说明保留。
- 更新详情删除与状态标题重复的说明，保留下载量、错误原因、回退的数据保留信息以及操作后果。
- 新增 settings.download-loading 和 settings.app-help。同步旧 GPUI 迁移验收脚本中受设置标题移除影响的点击与截图坐标；本轮未执行该桌面脚本。

## 集中检查结果

| 检查 | 结果 |
| --- | --- |
| cargo test --locked --bin ameow | 161 passed，0 failed，2 ignored（原生桌面相关） |
| python -m unittest discover -s scripts -p test_gallery_tools.py | 7 项通过，无桌面操作 |
| python -m py_compile scripts/test_gpui_migration.py | 通过；仅语法检查 |
| git diff --check（本轮涉及文件） | 通过 |
| cargo build --locked --bin ameow | 通过 |
| 使用 gallery.catalog 无窗口读取新版 EXE 目录 | 113 个场景，与源 JSON 完全一致，包含两个新增场景 |

新增回归覆盖下载位置读取失败不再显示读取中，以及队列统计省略零值并保持中英文显示。首次编译发现的焦点回调签名、Anchor 名称冲突及测试导入问题已修正，以上为修正后的最终结果。

产物：D:\Ameow\target\debug\ameow.exe

SHA256：54498B254F59CB46DC128E2672D9F342A40EE5CB075F958487DE41EA379C3980

## 用户验收

通过 D:\Ameow\target\debug\ameow.exe --gallery 打开 Gallery。本轮没有主动打开窗口、操作桌面或运行截图矩阵。

- 设置：settings.general、settings.download、settings.download-loading、settings.unavailable、settings.path-copied。确认删减后的层级、读取状态互斥和原位复制反馈。
- 组件与诊断：components.ready、diagnostics.copied、diagnostics.copy-failed。确认正常状态精简、复制成功留在按钮上、失败仍可见。
- 队列：queue.empty、queue.mixed。确认标题及统计，检查原有两行任务布局与悬停操作说明。
- 更新：settings.app-help。检查信息图标的悬停、点击、Tab 焦点、Escape 和移出焦点后的关闭；同时查看中英文与明暗主题下的尺寸和可读性。

构建与单元检查不代表原生 UI 验收通过；弹层位置、键盘交互和视觉效果仍待用户确认。未提交、未推送。
