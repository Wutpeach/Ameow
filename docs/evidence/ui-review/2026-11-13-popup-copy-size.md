# Full 组件失败浮窗复制图标

用户指出复制按钮过小且位置不妥。将复制及成功勾选SVG从8px改为共享ICON_SIZE（16px），移至标题行最右侧，文字占据剩余空间并与操作间隔6px；保留24px命中区。对应Gallery场景说明同步更新。

用户随后明确底色形状按容器区分：Full窗口本体保留圆形；内部浮窗、托盘弹窗和设置页保持圆角矩形。本轮已将浮窗复制、设置图标/信息按钮与托盘独立更新按钮恢复为圆角矩形；保留中性配色、16px图标及既有交互。此要求覆盖上一轮将所有独立图标按钮扩展为圆形的选择。

验证：cargo build --locked --bin ameow及diff --check通过；运行真实隔离预览，浅色/深色的copy与copied场景均确认右侧16px图标、圆角矩形底、标题位置与布局一致；另检查双主题设置按钮按下态及托盘更新按钮悬停态。

最终证据：target/ui-review/2026-11-13-popup-copy-size/popup-copy-final-review.png及native-final/report.json。最终EXE为该目录candidate-final.exe，亦已更新target/debug/ameow.exe。candidate.exe/candidate-right.exe与之前图像是调整过程证据。

本轮旧定向点击脚本在鼠标消息后丢失浮窗悬停，其native及native-02结果不能证明复制/恢复成功；以native-final的明确状态呈现为最终视觉证据。复制命令、成功回执及2秒恢复逻辑无改动，复用此前已验收证据；未重跑全套逻辑测试、未写真实剪贴板、未提交。最终视觉待用户验收。
