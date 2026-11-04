$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'preview-menu.ps1')
$scenes = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'preview-scenes.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
$checks = 0
foreach ($width in @(40, 76, 100)) {
    foreach ($height in @(18, 24, 40)) {
        $root = Get-PreviewMenu -Scenes $scenes -Current 'queue.mixed' -Notice '请选择界面' -Width $width -Height $height
        if ($root.Entries.Count -ne 9 -or $root.Lines.Count -gt $height - 2) { throw '分类目录布局异常' }
        if ($root.Entries[0].Name -cne 'compact' -or $root.Entries[-1].Name -cne 'overlay') { throw '分类顺序未沿用目录' }
        foreach ($line in $root.Lines) {
            if ($Host.UI.RawUI.LengthInBufferCells($line) -ge $width) { throw '分类目录超宽' }
        }
        foreach ($scene in $scenes) {
            $menu = Get-PreviewMenu -Scenes $scenes -Current $scene.name -Group $scene.surface -Notice '已切换' -Width $width -Height $height
            if ($menu.Lines.Count -gt $height - 2) { throw "菜单超出窗口高度：$width × $height" }
            foreach ($line in $menu.Lines) {
                if ($Host.UI.RawUI.LengthInBufferCells($line) -ge $width) { throw "菜单换行会挤走指南：$line" }
            }
            if (-not ($menu.Lines | Where-Object { $_.StartsWith('>') -and $_.Contains($scene.name) })) {
                throw "当前场景不在自动跳转的页面：$($scene.name)"
            }
            if (-not $menu.Lines[1].Contains('Enter 确认') -or -not $menu.Lines[3].Contains('[ 退出 ]')) { throw '操作指南不可见' }
            $expected = @($scenes | Where-Object { $_.surface -ceq $scene.surface })
            if (($menu.Entries.name -join ',') -cne ($expected.name -join ',')) { throw '状态目录混入其他界面或遗漏场景' }
            if ($menu.Focus -ne @($expected.name).IndexOf($scene.name)) { throw '选择光标未定位到当前场景' }
            if ($menu.FocusRows.Count -ne $menu.RowLines) { throw '窄窗口高亮行数错误' }
            for ($i = $menu.FirstIndex; $i -lt $menu.LastIndex; $i++) {
                for ($row = 0; $row -lt $menu.RowLines; $row++) {
                    $y = $menu.FirstRow + ($i - $menu.FirstIndex) * $menu.RowLines + $row
                    if ((Get-PreviewHitIndex $menu 3 $y) -ne $i) { throw '鼠标行列映射错误' }
                    if ((Get-PreviewClickChoice $menu 3 $y) -cne $expected[$i].name) { throw '单击未直接确认状态' }
                }
            }
            if ((Get-PreviewHitIndex $menu 3 ($menu.FirstRow - 1)) -ne -1 -or
                (Get-PreviewHitIndex $menu 3 ($menu.FirstRow + ($menu.LastIndex - $menu.FirstIndex) * $menu.RowLines)) -ne -1 -or
                (Get-PreviewHitIndex $menu -1 $menu.FirstRow) -ne -1 -or
                (Get-PreviewHitIndex $menu $width $menu.FirstRow) -ne -1) { throw '列表外点击未忽略' }
            $checks++
            foreach ($x in 0..7) { if ((Get-PreviewClickChoice $menu $x 3) -cne 'b') { throw '返回按钮范围错误' } }
            foreach ($x in 10..17) { if ((Get-PreviewClickChoice $menu $x 3) -cne 'q') { throw '退出按钮范围错误' } }
            foreach ($x in @(-1, 8, 9, 18)) { if ($null -ne (Get-PreviewClickChoice $menu $x 3)) { throw '按钮间隙误触发' } }
        }
    }
}
$last = Get-PreviewMenu -Scenes $scenes -Group 'queue' -Current 'queue.copy-failed' -Notice '保持当前场景' -Page 999
if ($last.Page -ne $last.PageCount - 1 -or $last.Focus -ne 18) { throw '末页定位异常' }
$single = Get-PreviewMenu -Scenes $scenes -Group 'overlay' -Current 'overlay.exit-confirm'
if ($single.Entries.Count -ne 1 -or $single.Focus -ne 0) { throw '单状态分类异常' }
$short = Limit-PreviewMenuLine '超长说明：诊断复制反馈与组件更新状态' 20
if (-not $short.EndsWith('…') -or $Host.UI.RawUI.LengthInBufferCells($short) -ge 20) { throw '窄窗口截断失败' }
$first = Get-PreviewMenu -Scenes $scenes -Group queue -Current queue.mixed -Focus 0
if ((Move-PreviewFocus $first up) -ne 0 -or (Move-PreviewFocus $first down) -ne 1 -or
    (Move-PreviewFocus $first next) -ne $first.PageSize -or (Move-PreviewFocus $last previous) -ne 0 -or
    (Move-PreviewFocus $last next) -ne 0 -or (Move-PreviewFocus $last down 20) -ne 18) { throw '键盘导航边界异常' }
if ($first.Focus -ne 0 -or -not ($first.Lines | Where-Object { $_ -eq '当前预览：queue.mixed' })) { throw '选中光标与当前预览混淆' }
$text = Get-PreviewMenu -Scenes $scenes -Group overlay -Current overlay.exit-confirm -TextInput
if (-not ($text.Lines | Where-Object { $_ -match '>  1  overlay.exit-confirm' })) { throw '文本回退目录编号缺失' }
if ($text.Buttons.Count -ne 0) { throw '文本回退不应显示点击按钮' }
if ($null -ne (Get-PreviewClickChoice $root 3 3) -or (Get-PreviewClickChoice $root 3 $root.FirstRow) -cne 'compact') { throw '分类层返回应禁用，单击分类应进入' }

Add-Type -Path (Join-Path $PSScriptRoot 'preview-console.cs')
$bridge = [Runtime.CompilerServices.RuntimeHelpers]::GetUninitializedObject([AmeowPreview.ConsoleInput])
$recordType = [AmeowPreview.ConsoleInput].GetNestedType('InputRecord', [Reflection.BindingFlags]::NonPublic)
if ([Runtime.InteropServices.Marshal]::SizeOf([type]$recordType) -ne 20 -or
    [Runtime.InteropServices.Marshal]::OffsetOf($recordType, 'Character').ToInt32() -ne 14 -or
    [Runtime.InteropServices.Marshal]::OffsetOf($recordType, 'MouseFlags').ToInt32() -ne 16) { throw 'Windows 输入结构布局错误' }
$convert = [AmeowPreview.ConsoleInput].GetMethod('ConvertRecord', [Reflection.BindingFlags]'Instance,NonPublic')
foreach ($case in @(
    @{ Key = 38; Char = 0; Controls = 0; Action = 'up' },
    @{ Key = 40; Char = 0; Controls = 0; Action = 'down' },
    @{ Key = 37; Char = 0; Controls = 0; Action = 'previous' },
    @{ Key = 39; Char = 0; Controls = 0; Action = 'next' },
    @{ Key = 13; Char = 13; Controls = 0; Action = 'confirm' },
    @{ Key = 27; Char = 27; Controls = 0; Action = 'back' },
    @{ Key = 0; Char = 113; Controls = 0; Action = 'quit' },
    @{ Key = 67; Char = 3; Controls = 8; Action = 'quit' }
)) {
    $record = [Activator]::CreateInstance($recordType)
    foreach ($field in @{ Type = [uint16]1; KeyDown = [int]1; Repeat = [uint16]3; VirtualKey = [uint16]$case.Key; Character = [char]$case.Char; Controls = [uint32]$case.Controls }.GetEnumerator()) {
        $recordType.GetField($field.Key).SetValue($record, $field.Value)
    }
    $event = $convert.Invoke($bridge, [object[]]@($record))
    if ($event.Action -cne $case.Action) { throw '原生按键事件转换错误' }
    $delta = if ($case.Action -in @('up', 'down', 'previous', 'next')) { 3 } else { 1 }
    if ($event.Delta -ne $delta) { throw '按键重复次数错误' }
}
Write-Output "PASS：$checks 个场景/终端尺寸组合；键盘导航、单击确认、返回/退出按钮边界与 Win32 输入结构通过。"
