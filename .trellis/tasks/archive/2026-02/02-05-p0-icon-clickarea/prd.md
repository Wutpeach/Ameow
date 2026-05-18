# P0: 图标模式点击区域修复（动画后调整尺寸）

## 问题描述

悬浮窗模式尺寸 220x220，缩小为图标模式后：
- 视觉尺寸：~60x60（CSS scale 0.3）
- 实际窗口尺寸：仍为 220x220
- 导致图标周围存在不可点击的透明区域

---

## 第一次尝试（失败）

### 方案
在 `animate` 中同时设置 `scale` 和 `x/y` 位移：
```tsx
animate={{
  scale: isMinimized ? 0.35 : 1,
  x: isMinimized ? -65 : 0,
  y: isMinimized ? -65 : 0,
}}
```

### 问题
1. **动画从左上角缩放**：scale 和 x/y 同时变化，导致内容左上角始终在 (0,0)
2. **闪现问题**：动画完成后窗口缩小，图标位置跳变

### 根本原因分析
- 内容 200x200，`transformOrigin: 'center'`
- 缩放后内容中心在 (100, 100)，边界在 (65, 65) 到 (135, 135)
- 窗口缩小到 70x70 后只显示 (0, 0) 到 (70, 70)
- 必须用 x/y=-65 把内容移到窗口内
- 但 x/y 位移与 scale 同时进行，破坏了"从中心缩放"的视觉效果

---

## 推荐方案：分阶段动画

### 核心思路
动画期间不移动内容，动画完成后再调整窗口和内容位置

### 悬浮窗 → 图标模式
1. **动画阶段**：scale 1→0.35（从中心缩放，x/y 保持 0）
2. **动画完成后**：
   - 瞬间设置内容 transform: translate(-75px, -75px)
   - 同时缩小窗口到 70x70，位置 +75px
   - 因为同时进行，视觉上内容位置不变

### 图标模式 → 悬浮窗
1. **动画开始前**：
   - 放大窗口到 220x220，位置 -75px
   - 瞬间移除内容的 translate
2. **动画阶段**：scale 0.35→1（从中心放大）

### 实现要点

1. **新增状态**：`windowResized` 跟踪窗口是否已缩小
2. **条件样式**：当 `windowResized` 时应用 translate(-75px, -75px)
3. **时序控制**：窗口缩放和内容位移必须同时进行

### 关键代码结构
```tsx
const [windowResized, setWindowResized] = useState(false);

// animate 中不使用 x/y
animate={{
  scale: isMinimized ? 0.35 : 1,
  borderRadius: isMinimized ? 100 : 16,
}}

// 条件样式补偿
style={{
  transform: windowResized ? 'translate(-75px, -75px)' : 'none',
}}

// onAnimationComplete: 最小化完成后缩小窗口
// onAnimationStart: 展开前放大窗口
```

---

## 相关文件

- `src/App.tsx` - 主悬浮窗组件
- `src-tauri/src/lib.rs` - 窗口尺寸/位置命令（已添加）

## 已完成

- [x] 后端命令 `set_window_size`, `set_window_position`
- [ ] 前端分阶段动画实现

## 验收标准

- [ ] 图标模式下点击区域与视觉尺寸匹配
- [ ] 过渡动画从中心缩放（非左上角）
- [ ] 动画完成后无闪现
- [ ] 位置补偿正确，视觉中心不变
