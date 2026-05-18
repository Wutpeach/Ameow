# Fix videodl Download UX Issues

## Goal

Improve the videodl download experience by fixing animation issues, adding proper cancel feedback, and ensuring theme consistency.

## Requirements

### 1. Cancel Download Functionality
- Ensure cancel button works properly during download
- Backend `cancel_download` command already exists

### 2. Fix Completion Animation
- Current issue: Window shrinks when showing checkmark, causing jarring effect
- Solution: Keep window size constant during completion animation
- Only show icon animation (scale/fade), not window resize

### 3. Cancelled/Aborted State Icon
- Show X icon (not checkmark) when:
  - User cancels download
  - Download is aborted/fails
- Add `downloadCancelled` state to track this

### 4. Theme-consistent Icon Colors
- Current issue: Checkmark uses hardcoded `text-green-400`
- Fix: Use ThemeContext colors for both success and cancel icons
- Verify colors work in both white and black themes

## Acceptance Criteria

- [ ] Cancel button properly cancels download and shows X icon
- [ ] Completion animation does not resize window
- [ ] Success shows green checkmark, cancel/fail shows red X
- [ ] Icon colors match theme (white and black)
- [ ] Lint and typecheck pass

## Technical Notes

### Files to Modify
- `src/App.tsx` - Main download UI logic
- `src/contexts/ThemeContext.tsx` - Add success/error icon colors if needed

### Key Code Locations
- Cancel button: `src/App.tsx` lines 1024-1073
- Checkmark display: `src/App.tsx` line 1083
- Window shrink logic: `src/App.tsx` lines 103-118
- Download complete handler: `src/App.tsx` lines 191-203

### Theme Colors Reference
ThemeContext already has:
- `progressCancelIcon` - for cancel button
- `progressCancelHoverIcon` - red color for hover

May need to add:
- `successIcon` - green for checkmark
- `errorIcon` - red for X icon
