# Frontend: Context Menu Fix

## Goal

修复悬浮窗右键菜单的两个问题：无法关闭 + 样式未跟随主题。

## Requirements

1. 右键菜单样式使用 ThemeContext 的 colors 变量
2. 鼠标移出窗口时自动关闭菜单
3. 窗口失焦时自动关闭菜单

## Acceptance Criteria

- [ ] 切换到 white 主题时，右键菜单背景、边框、文字颜色跟随变化
- [ ] 鼠标移出悬浮窗区域时，菜单自动关闭
- [ ] 点击窗口外部区域时，菜单自动关闭

## Technical Notes

**文件**: `src/App.tsx`

### 1. 主题颜色 (lines 1194-1226)

替换硬编码颜色：
- `backgroundColor: '#2a2a2a'` → `colors.bgSecondary`
- `border: '1px solid #3a3a3a'` → `1px solid ${colors.borderStart}`
- `color: '#e0e0e0'` → `colors.textPrimary`
- hover 背景 `#404040` → `colors.bgPrimary`

### 2. 关闭逻辑

添加 useEffect 监听窗口失焦：
```tsx
useEffect(() => {
  if (!contextMenu) return;
  const handleWindowBlur = () => setContextMenu(null);
  window.addEventListener('blur', handleWindowBlur);
  return () => window.removeEventListener('blur', handleWindowBlur);
}, [contextMenu]);
```

motion.div 添加 onMouseLeave：
```tsx
onMouseLeave={() => {
  setContextMenu(null);
  setIsPanelHovered(false);
}}
```
