# Terminal presentation only; the catalog and preview process remain owned by preview.ps1.
function Limit-PreviewMenuLine([string]$Text, [int]$Width) {
    $limit = [Math]::Max(1, $Width - 1)
    if ($Host.UI.RawUI.LengthInBufferCells($Text) -le $limit) { return $Text }
    $ends = [System.Globalization.StringInfo]::ParseCombiningCharacters($Text)
    for ($i = $ends.Count - 1; $i -ge 0; $i--) {
        $short = $Text.Substring(0, $ends[$i]) + '…'
        if ($Host.UI.RawUI.LengthInBufferCells($short) -le $limit) { return $short }
    }
    return '…'
}

function Get-PreviewGroups($Scenes) {
    $labels = @{
        compact = '折叠主界面'; full = '展开主界面'; queue = '下载队列'
        settings = '设置'; components = '组件管理'; diagnostics = '诊断'
        tray = '托盘弹窗'; menu = '右键菜单'; overlay = '退出确认'
    }
    foreach ($surface in ($Scenes.surface | Select-Object -Unique)) {
        $label = $labels[$surface]
        if (-not $label) { $label = $surface }
        [pscustomobject]@{ Name = $surface; Label = $label; Scenes = @($Scenes | Where-Object { $_.surface -ceq $surface }) }
    }
}

function Get-PreviewMenu {
    param($Scenes, [string]$Current, [string]$Notice, [string]$Group, [int]$Focus = -1, [int]$Page = -1, [int]$Width = 80, [int]$Height = 24, [switch]$TextInput, [string]$HoverAction)
    $groups = @(Get-PreviewGroups $Scenes)
    $category = $groups | Where-Object { $_.Name -ceq $Group }
    $entries = if ($category) { @($category.Scenes) } else { $groups }
    $rowLines = if (-not $category -or $Width -ge 76) { 1 } else { 2 }
    $pageSize = [Math]::Max(1, [Math]::Min(12, [Math]::Floor(($Height - 12) / $rowLines)))
    $pageCount = [int][Math]::Ceiling($entries.Count / $pageSize)
    if ($Focus -ge 0) {
        $Focus = [Math]::Min($Focus, $entries.Count - 1)
        $Page = [int][Math]::Floor($Focus / $pageSize)
    } else {
        $Focus = [Math]::Max(0, @($entries.Name).IndexOf($Current))
        if ($Page -lt 0) { $Page = [int][Math]::Floor($Focus / $pageSize) }
    }
    $Page = [Math]::Max(0, [Math]::Min($Page, $pageCount - 1))
    $first = [int]($Page * $pageSize)
    $last = [int][Math]::Min($first + $pageSize, $entries.Count)
    $title = if ($category) { "界面分类 / $($category.Label)" } else { '界面分类' }
    $guide = if ($TextInput) { '编号 / 名称选择 · n / p 翻页' } else { '↑↓ 选择 · ←→ 翻页 · Enter 确认' }
    $lines = @(
        "Ameow · $title"
        $guide
        '悬停高亮 · 单击确认'
        '[ 返回 ]  [ 退出 ] · Esc / q'
        ''
        "当前预览：$Current"
        $Notice
        ''
        "$($first + 1)–$last / $($entries.Count) · 第 $($Page + 1)/$pageCount 页"
    )
    if ($TextInput) { $lines[2] = 'b 返回分类 · help 帮助 · q 退出'; $lines[3] = '' }
    $buttons = if ($TextInput) { @() } else { @(
        [pscustomobject]@{ Action = 'b'; X = 0; Width = 8; Label = '[ 返回 ]'; Enabled = [bool]$category }
        [pscustomobject]@{ Action = 'q'; X = 10; Width = 8; Label = '[ 退出 ]'; Enabled = $true }
    ) }
    $firstRow = $lines.Count
    $focusRows = @()
    for ($i = $first; $i -lt $last; $i++) {
        $entry = $entries[$i]
        $marker = if ($i -eq $Focus) { '>' } else { ' ' }
        if ($i -eq $Focus) { $focusRows = @($lines.Count..($lines.Count + $rowLines - 1)) }
        $number = if ($TextInput) { '{0,2}  ' -f ($i + 1) } else { '' }
        if (-not $category) {
            $lines += '{0} {1}{2} · {3} 个状态' -f $marker, $number, $entry.Label, $entry.Scenes.Count
        } elseif ($rowLines -eq 1) {
            $lines += '{0} {1}{2,-32} {3}' -f $marker, $number, $entry.name, $entry.description
        } else {
            $lines += '{0} {1}{2}' -f $marker, $number, $entry.name
            $lines += '  ' + $entry.description
        }
    }
    $lines += ''
    [pscustomobject]@{
        Lines = @($lines | ForEach-Object { Limit-PreviewMenuLine $_ $Width })
        Page = $Page
        PageSize = [int]$pageSize
        PageCount = $pageCount
        Entries = @($entries)
        Focus = $Focus
        FocusRows = $focusRows
        FirstRow = $firstRow
        FirstIndex = $first
        LastIndex = $last
        RowLines = $rowLines
        Width = $Width
        Height = $Height
        Buttons = @($buttons)
        ButtonRow = 3
        HoverAction = $HoverAction
    }
}

function Get-PreviewHitIndex($Menu, [int]$X, [int]$Y) {
    if ($X -lt 0 -or $X -ge $Menu.Width - 1 -or $Y -lt $Menu.FirstRow) { return -1 }
    $index = $Menu.FirstIndex + [int][Math]::Floor(($Y - $Menu.FirstRow) / $Menu.RowLines)
    if ($index -ge $Menu.LastIndex) { return -1 }
    return $index
}

function Get-PreviewButtonAction($Menu, [int]$X, [int]$Y) {
    if ($Y -ne $Menu.ButtonRow) { return $null }
    foreach ($button in $Menu.Buttons) {
        if ($button.Enabled -and $X -ge $button.X -and $X -lt $button.X + $button.Width -and $X -lt $Menu.Width - 1) { return $button.Action }
    }
    return $null
}

function Get-PreviewClickChoice($Menu, [int]$X, [int]$Y) {
    $action = Get-PreviewButtonAction $Menu $X $Y
    if ($action) { return $action }
    $hit = Get-PreviewHitIndex $Menu $X $Y
    if ($hit -ge 0) { return $Menu.Entries[$hit].Name }
    return $null
}

function Move-PreviewFocus($Menu, [string]$Action, [int]$Delta = 1) {
    $Delta = [Math]::Max(1, $Delta)
    switch ($Action) {
        'up' { return [Math]::Max(0, $Menu.Focus - $Delta) }
        'down' { return [Math]::Min($Menu.Entries.Count - 1, $Menu.Focus + $Delta) }
        'first' { return 0 }
        'last' { return $Menu.Entries.Count - 1 }
        'previous' { $Delta = -$Delta }
    }
    $page = (($Menu.Page + $Delta) % $Menu.PageCount + $Menu.PageCount) % $Menu.PageCount
    return $page * $Menu.PageSize
}

function Show-PreviewMenu($Menu) {
    [Console]::Write("`e[H`e[2J")
    for ($row = 0; $row -lt $Menu.Lines.Count; $row++) {
        $line = $Menu.Lines[$row]
        if ($row -eq $Menu.ButtonRow) {
            foreach ($button in $Menu.Buttons) {
                if (-not $button.Enabled) { $line = $line.Replace($button.Label, "`e[2m$($button.Label)`e[0m") }
                elseif ($button.Action -eq $Menu.HoverAction) { $line = $line.Replace($button.Label, "`e[7m$($button.Label)`e[0m") }
            }
        }
        if ($row -in $Menu.FocusRows) { $line = "`e[7m$line`e[0m" }
        [Console]::Write($line + "`r`n")
    }
}
