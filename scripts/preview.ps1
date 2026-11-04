param(
    [string]$Scene,
    [string]$Exe = (Join-Path $PSScriptRoot '../target/debug/ameow.exe'),
    [string]$Capture,
    [switch]$List
)
$ErrorActionPreference = 'Stop'
$owned = $null
$console = $null
$sessionDir = $null
$utf8 = [System.Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'preview-menu.ps1')
$menuRedraw = -not $Scene -and -not $Capture -and -not $List -and -not [Console]::IsOutputRedirected -and -not [Console]::IsInputRedirected
try {
    if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) {
        throw "找不到预览程序：$Exe。请先在仓库根目录运行 cargo build --bin ameow，或使用 -Exe 指定开发程序。"
    }
    $Exe = (Resolve-Path -LiteralPath $Exe).Path
    $sessionDir = Join-Path ([System.IO.Path]::GetTempPath()) ('ameow-preview-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $sessionDir | Out-Null
    $catalogPath = Join-Path $sessionDir 'catalog.json'
    $catalogProcess = Start-Process -FilePath $Exe -ArgumentList @('--preview', '--preview-catalog-out', ('"' + $catalogPath + '"')) -WindowStyle Hidden -PassThru
    if (-not $catalogProcess.WaitForExit(10000) -or $catalogProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $catalogPath)) {
        if (-not $catalogProcess.HasExited) { $catalogProcess.Kill() }
        throw '程序不支持场景目录，或读取目录失败；请重新编译当前源码。'
    }
    $scenes = @(Get-Content -LiteralPath $catalogPath -Raw -Encoding UTF8 | ConvertFrom-Json)
    function Show-Scenes {
        Write-Host 'Ameow 隔离预览 · 完整目录（可用 -Scene 加完整名称直达）'
        for ($i = 0; $i -lt $scenes.Count; $i++) {
            Write-Host ('{0,2}  {1,-32} {2}' -f ($i + 1), $scenes[$i].name, $scenes[$i].description)
        }
    }
    if ($List) { Show-Scenes; return }
    if (-not $Scene) { $Scene = 'queue.mixed' }
    if (-not ($scenes | Where-Object { $_.name -ceq $Scene })) { throw "未知预览场景：$Scene。使用 -List 查看目录。" }
    $control = Join-Path $sessionDir 'control.json'
    $ack = Join-Path $sessionDir 'control.ack.json'
    $owned = Start-Process -FilePath $Exe -ArgumentList @('--preview', '--preview-scene', $Scene, '--preview-control', ('"' + $control + '"')) -WindowStyle Hidden -PassThru
    $step = 0
    function Select-Scene([string]$name) {
        $script:step++
        $request = @{ step = $script:step; scene = $name } | ConvertTo-Json -Compress
        $pending = Join-Path $sessionDir 'request.tmp'
        [System.IO.File]::WriteAllText($pending, $request, $utf8)
        Move-Item -LiteralPath $pending -Destination $control -Force
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            if ($owned.HasExited) { throw "预览进程已退出，退出码 $($owned.ExitCode)。" }
            if (Test-Path -LiteralPath $ack) {
                try { $receipt = Get-Content -LiteralPath $ack -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $receipt = $null }
                if ($receipt -and $receipt.pid -eq $owned.Id -and $receipt.step -eq $script:step) {
                    if ($receipt.error) { throw "场景切换失败：$($receipt.error)" }
                    if ($receipt.scene -cne $name) { throw "场景回执不匹配：$($receipt.scene)" }
                    if (-not $menuRedraw) { Write-Host "已切换：$name（PID $($owned.Id)）" }
                    return
                }
            }
            Start-Sleep -Milliseconds 50
        } while ([DateTime]::UtcNow -lt $deadline)
        throw "切换场景超时：$name。请检查预览窗口和当前开发程序。"
    }
    Select-Scene $Scene
    if ($Capture) {
        Start-Sleep -Milliseconds 1200
        & python (Join-Path $PSScriptRoot 'preview_capture.py') --pid $owned.Id --scene $Scene --exe $Exe --output $Capture --receipt $ack
        if ($LASTEXITCODE -ne 0) { throw 'Windows 原生截图失败，请查看上方错误。' }
        return
    }
    if ($PSBoundParameters.ContainsKey('Scene')) {
        Write-Host '命名场景已打开；关闭窗口或按 Ctrl+C 退出本轮预览。'
        while (-not $owned.WaitForExit(200)) { }
        return
    }
    $page = -1
    $group = ''
    $groups = @(Get-PreviewGroups $scenes)
    $notice = "已连接 · PID $($owned.Id)"
    $focus = 0
    $hoverAction = ''
    $redraw = $true
    if ($menuRedraw) {
        if (-not ('AmeowPreview.ConsoleInput' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'preview-console.cs') }
        $console = [AmeowPreview.ConsoleInput]::new()
    }
    while (-not $owned.HasExited) {
        $width = 80; $height = 24
        if ($menuRedraw) {
            $width = $Host.UI.RawUI.WindowSize.Width
            $height = $Host.UI.RawUI.WindowSize.Height
        }
        if (-not $menuRedraw -or $redraw -or $width -ne $menu.Width -or $height -ne $menu.Height) {
            $menuFocus = if ($menuRedraw) { $focus } else { -1 }
            $menu = Get-PreviewMenu -Scenes $scenes -Current $Scene -Notice $notice -Group $group -Focus $menuFocus -Page $page -Width $width -Height $height -TextInput:(-not $menuRedraw) -HoverAction $hoverAction
            $page = $menu.Page
            if ($menuRedraw) {
                $focus = $menu.Focus
                Show-PreviewMenu $menu
            } else {
                foreach ($line in $menu.Lines) { Write-Host $line }
            }
            $redraw = $false
        }
        if ($menuRedraw) {
            $event = $console.Read(100)
            if ($null -eq $event) { continue }
            $choice = $null
            switch ($event.Action) {
                { $_ -in @('up', 'down', 'first', 'last', 'previous', 'next') } {
                    $nextFocus = Move-PreviewFocus $menu $event.Action $event.Delta
                    $redraw = $nextFocus -ne $focus
                    $focus = $nextFocus
                    if ($hoverAction) { $hoverAction = ''; $redraw = $true }
                }
                { $_ -in @('hover', 'click') } {
                    # Discard coordinates from the old layout while a resize is pending.
                    $size = $Host.UI.RawUI.WindowSize
                    if ($size.Width -ne $menu.Width -or $size.Height -ne $menu.Height) { $redraw = $true; break }
                    $button = Get-PreviewButtonAction $menu $event.X $event.Y
                    $redraw = $redraw -or $button -ne $hoverAction
                    $hoverAction = $button
                    $hit = Get-PreviewHitIndex $menu $event.X $event.Y
                    if ($hit -ge 0) {
                        $redraw = $redraw -or $hit -ne $focus
                        $focus = $hit
                    }
                    # The second press of a double-click is ignored after the first changes the menu.
                    if ($event.Action -eq 'click') { $choice = Get-PreviewClickChoice $menu $event.X $event.Y }
                }
                'confirm' { $choice = $menu.Entries[$focus].Name }
                'back' { $choice = 'b' }
                'quit' { $choice = 'q' }
                'help' { $choice = 'help' }
                'resize' { $redraw = $true }
            }
            if ($null -eq $choice) { continue }
        } else {
            $prompt = if ($group) { '状态' } else { '界面' }
            $choice = Read-Host $prompt
        }
        if ($null -eq $choice) { break }
        $choice = $choice.Trim()
        $redraw = $true
        if ($choice -eq 'q') { break }
        if ($choice -eq 'help') {
            $notice = if ($menuRedraw) { '悬停高亮，单击 / Enter 切换；顶部按钮返回或退出。' } else { '编号选择当前目录；完整场景名直达；b 返回分类。' }
            continue
        }
        if ($choice -eq 'b' -or $choice -eq '0') {
            $focus = [Math]::Max(0, @($groups.Name).IndexOf($group))
            $group = ''; $page = -1; $notice = '请选择界面分类，当前预览保持不变。'; continue
        }
        if ($choice -eq 'n') { $page = ($page + 1) % $menu.PageCount; continue }
        if ($choice -eq 'p') { $page = ($page + $menu.PageCount - 1) % $menu.PageCount; continue }
        $number = 0
        if ([int]::TryParse($choice, [ref]$number)) {
            if ($number -lt 1 -or $number -gt $menu.Entries.Count) {
                $notice = "编号超出范围，请输入 1–$($menu.Entries.Count)。"; continue
            }
            $choice = $menu.Entries[$number - 1].Name
        }
        if (-not $group) {
            $category = $groups | Where-Object { $_.Name -ceq $choice }
            if ($category) {
                $group = $category.Name; $page = -1
                $focus = [Math]::Max(0, @($category.Scenes.Name).IndexOf($Scene))
                $notice = if ($menuRedraw) { '请选择状态，单击 / Enter 确认。' } else { '请选择状态；切换后可继续输入本界面的状态编号。' }
                continue
            }
        }
        $chosen = $scenes | Where-Object { $_.name -ceq $choice }
        if (-not $chosen) { $notice = "未知场景：$choice。输入 help 查看帮助。"; continue }
        Select-Scene $choice
        $Scene = $choice
        $group = $chosen.surface
        $focus = @($scenes | Where-Object { $_.surface -ceq $group } | ForEach-Object { $_.name }).IndexOf($Scene)
        $page = -1
        $notice = "已切换 · $($chosen.description)"
    }
} finally {
    if ($console) { $console.Dispose() }
    if ($owned -and -not $owned.HasExited) {
        $step++
        [System.IO.File]::WriteAllText($control, (@{ step = $step; quit = $true } | ConvertTo-Json -Compress), $utf8)
        if (-not $owned.WaitForExit(3000)) { $owned.Kill(); $owned.WaitForExit() }
    }
    if ($sessionDir) {
        # Only this invocation's GUID directory is eligible for cleanup.
        $resolved = [System.IO.Path]::GetFullPath($sessionDir)
        $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        if ($resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and ([System.IO.Path]::GetFileName($resolved)).StartsWith('ameow-preview-')) {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
