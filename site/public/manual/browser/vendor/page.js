(() => {
  // src/page-core.mjs
  function clipRange(value, duration) {
    if (!value || Object.keys(value).some((k) => !["start_ms", "end_ms", "precise"].includes(k)) || Object.hasOwn(value, "precise") && typeof value.precise !== "boolean" || !Number.isSafeInteger(value.start_ms) || !Number.isSafeInteger(value.end_ms) || value.start_ms < 0 || value.end_ms <= value.start_ms || Number.isFinite(duration) && value.end_ms > Math.round(duration * 1e3)) throw Error("E_CLIP_RANGE");
    return { start_ms: value.start_ms, end_ms: value.end_ms, ...value.precise ? { precise: true } : {} };
  }
  function parseTime(value) {
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(value.trim())) return null;
    const parts = value.trim().split(":");
    if (parts.slice(1).some((p) => Number(p) >= 60)) return null;
    const seconds = parts.reduce((sum, p) => sum * 60 + Number(p), 0);
    const ms = Math.round(seconds * 1e3);
    return Number.isSafeInteger(ms) ? ms : null;
  }
  function formatTime(ms) {
    if (ms === null || !Number.isFinite(ms)) return "";
    ms = Math.max(0, Math.round(ms));
    const hours = Math.floor(ms / 36e5), mins = Math.floor(ms / 6e4) % 60;
    return (hours ? hours + ":" + String(mins).padStart(2, "0") : String(mins)) + ":" + String(Math.floor(ms / 1e3) % 60).padStart(2, "0") + "." + String(ms % 1e3).padStart(3, "0");
  }

  // src/page-ui.css
  var page_ui_default = ':host { --surface:#fff; --text:#292a2c; --muted:#62656b; --control:#f2f2f3; --hover:#ecedef; --line:#ecedef; --focus:#0285ff; --success:#199a4d; --error:#b8323c; font:13px/1.5 "Segoe UI","Microsoft YaHei UI",sans-serif; color:var(--text); color-scheme:light dark; }\r\n* { box-sizing:border-box; }\r\nbutton,input { font:inherit; color:inherit; }\r\nbutton { cursor:pointer; border:0; border-radius:6px; background:var(--control); min-height:36px; padding:6px 12px; transition:background 150ms ease-out,opacity 110ms ease-out; }\r\nbutton:hover { background:var(--hover); }\r\nbutton:disabled { opacity:.45; cursor:default; }\r\nbutton:focus-visible,input:focus-visible { outline:2px solid var(--focus); outline-offset:3px; }\r\nbutton > svg,button > img { width:18px; height:18px; display:block; pointer-events:none; transition:transform 110ms cubic-bezier(.2,.8,.2,1); }\r\nbutton:active > svg,button:active > img { transform:scale(.88); }\r\nsvg { fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }\r\n.toolbar { position:absolute; right:0; width:32px; height:32px; color:#fff; pointer-events:auto; opacity:1; font:400 13px/20px "Segoe UI","Microsoft YaHei UI",sans-serif; transition:width 110ms cubic-bezier(.2,.8,.2,1),opacity 180ms ease-out; }\r\n.toolbar[data-expanded] { width:156px; transition:width 200ms cubic-bezier(.16,1,.3,1),opacity 180ms ease-out; }\r\n.toolbar[data-dim] { opacity:.6; }\r\n.capsule { position:absolute; inset:0; border:1px solid #ffffff30; border-radius:999px; background:rgb(25 26 29 / .84); pointer-events:none; }\r\n.toolbar button { position:absolute; top:0; height:32px; min-height:32px; display:flex; align-items:center; justify-content:center; gap:6px; border-radius:999px; background:transparent; color:#fff; padding:0; white-space:nowrap; }\r\n.toolbar button:hover { background:#ffffff20; }\r\n.toolbar:has(button:focus-visible) .capsule { outline:2px solid var(--focus); outline-offset:2px; }\r\n.toolbar button:focus-visible { outline-offset:-2px; }\r\n.toolbar svg { width:16px; height:16px; flex:none; }\r\n.toolbar .download { right:0; width:82px; clip-path:inset(0 0 0 50px round 999px); transition:clip-path 110ms cubic-bezier(.2,.8,.2,1); }\r\n.toolbar[data-expanded] .download { clip-path:inset(0 round 999px); transition-duration:200ms; }\r\n.download-icon { position:absolute; top:8px; right:8px; display:grid; place-items:center; width:16px; height:16px; transition:transform 110ms cubic-bezier(.2,.8,.2,1); }\r\n.toolbar[data-expanded] .download-icon { transform:translateX(-44px); transition-duration:200ms; }\r\n.download-icon svg { width:16px; height:16px; fill:currentColor; stroke:none; transition:transform 110ms ease-out; }\r\n.toolbar .download:active svg { transform:scale(.88); }\r\n.download-label { position:absolute; top:6px; right:12px; width:26px; line-height:20px; white-space:nowrap; overflow:hidden; opacity:0; transition:opacity 90ms ease-out; }\r\n.toolbar[data-expanded] .download-label { opacity:1; transition:opacity 150ms ease-out 40ms; }\r\n.toolbar .select { right:84px; width:70px; opacity:0; transform:translateX(16px); pointer-events:none; transition:opacity 110ms ease-out,transform 110ms cubic-bezier(.2,.8,.2,1); }\r\n.toolbar .select span { flex:none; white-space:nowrap; }\r\n.toolbar[data-expanded] .select { opacity:1; transform:translateX(0); pointer-events:auto; transition-duration:180ms; }\r\n.toolbar[data-status="accepted"] .download svg { fill:none; stroke:currentColor; color:#81eaa7; }\r\n.toolbar[data-status="pending"] .download { opacity:.65; }\r\n.feedback { position:absolute; right:0; top:40px; width:max-content; max-width:min(300px,70vw); padding:8px 12px; border-radius:6px; background:var(--surface); color:var(--text); box-shadow:0 3px 12px #0003; }\r\n.feedback:empty { display:none; }\r\n.controls { -webkit-user-select:none; user-select:none; padding:8px 10px; background:var(--surface); color:var(--text); font:400 13px/20px "Segoe UI","Microsoft YaHei UI",sans-serif; }\r\n[hidden] { display:none!important; }\r\n.controls :is(input:not([type=range]),textarea,[contenteditable]:not([contenteditable=false])) { -webkit-user-select:text; user-select:text; }\r\n.timeline { width:auto; margin:0 16px; }\r\n.track { position:relative; height:50px; }\r\n.ticks { position:absolute; inset:0 0 auto; height:14px; font-size:10px; line-height:11px; color:var(--muted); cursor:crosshair; }\r\n.ticks span { position:absolute; transform:translateX(-50%); }\r\n.ticks span:first-child { transform:none; }\r\n.ticks span::after { content:""; display:block; width:1px; height:3px; background:var(--muted); opacity:.45; margin:auto; }\r\n.rail,.band { position:absolute; top:30px; left:0; right:0; height:3px; border-radius:2px; pointer-events:none; }\r\n.rail { background:var(--line); }\r\n.band { top:28px; height:7px; background:var(--focus); opacity:0; transition:opacity 110ms ease-out; }\r\n.track input { position:absolute; top:24px; left:0; width:100%; height:24px; min-width:0; margin:0; appearance:none; background:transparent; cursor:crosshair; }\r\n.track input::-webkit-slider-runnable-track { height:3px; background:transparent; }\r\n.track input::-webkit-slider-thumb { appearance:none; width:8px; height:8px; border-radius:50%; background:transparent; margin-top:-2.5px; }\r\n.track .handle { position:absolute; top:4px; width:24px; height:24px; min-height:24px; padding:0; border-radius:4px; background:transparent; cursor:ew-resize; touch-action:none; z-index:3; }\r\n.handle.in { transform:translateX(-100%); }\r\n.handle svg { position:absolute; top:7px; width:14px; height:18px; stroke-width:1.8; color:var(--focus); fill:var(--surface); pointer-events:none; }\r\n.handle.in svg { right:-7px; }\r\n.handle.out svg { left:-7px; }\r\n/* Keep the 14px frame centered on timestampX; align cap tip with the existing full Marker. */\r\n.handle[data-shape=in] svg,.handle[data-shape=out] svg { height:14px; top:8.1542px; }\r\n.track .handle.single { width:40px; transform:translateX(-50%); cursor:ew-resize; }\r\n.track .handle.single svg { left:13px; right:auto; }\r\n.track .handle:hover,.track .handle:focus-visible,.track .handle[data-dragging] { background:color-mix(in srgb,var(--focus) 12%,transparent); }\r\n.track .handle.single[data-side=in] { cursor:w-resize; }\r\n.track .handle.single[data-side=out] { cursor:e-resize; }\r\n.track .handle.single:hover::before,.track .handle.single[data-dragging]::before { content:""; position:absolute; inset:0 50% 0 0; border-radius:4px; background:color-mix(in srgb,var(--focus) 20%,transparent); pointer-events:none; }\r\n.track .handle.single[data-side=out]::before { inset:0 0 0 50%; }\r\n.playhead { position:absolute; top:28px; width:12px; height:22px; margin-left:-6px; pointer-events:auto; cursor:ew-resize; touch-action:none; z-index:4; }\r\n.playhead::after { content:""; position:absolute; left:6px; top:0; width:1px; height:22px; background:var(--text); }\r\n.playhead::before { content:""; position:absolute; left:3px; top:0; width:7px; height:5px; background:var(--text); clip-path:polygon(0 0,100% 0,50% 100%); }\r\n.buffered { position:absolute; top:30px; left:0; right:0; height:3px; pointer-events:none; }\r\n.buffered span { position:absolute; height:100%; background:var(--muted); opacity:.3; }\r\n.track[data-selection] .rail { opacity:.45; }\r\n.track .range-body { position:absolute; top:40px; height:10px; min-height:10px; min-width:24px; transform:translateX(-50%); border-radius:3px; padding:0; background:color-mix(in srgb,var(--focus) 22%,transparent); cursor:grab; touch-action:none; z-index:2; }\r\n.track .range-body:hover,.track .range-body[data-dragging] { background:color-mix(in srgb,var(--focus) 45%,transparent); }\r\n.track .range-body::after { content:""; display:block; width:8px; height:2px; border-radius:2px; margin:auto; background:var(--focus); opacity:.65; }\r\n.track .range-body[data-dragging] { cursor:grabbing; }\r\n.time-bubble { position:absolute; bottom:54px; padding:3px 6px; white-space:nowrap; border-radius:4px; background:var(--text); color:var(--surface); font-size:11px; line-height:16px; font-variant-numeric:tabular-nums; pointer-events:none; z-index:7; }\r\n.track-times { display:flex; justify-content:space-between; gap:8px; height:14px; color:var(--muted); font-size:10px; line-height:14px; font-variant-numeric:tabular-nums; white-space:nowrap; }\r\n.time { min-width:0; overflow:hidden; text-overflow:ellipsis; }\r\n.duration,.buffering { flex:none; }\r\n.duration:empty,.buffering:empty { display:none; }\r\n.control-row,.tools,.actions { display:flex; align-items:center; gap:6px; min-width:0; }\r\n.control-row { justify-content:space-between; margin-top:6px; }\r\n.icon { position:relative; width:32px; height:32px; min-height:32px; padding:0; display:grid; place-items:center; flex:none; background:transparent; color:var(--muted); }\r\n.icon svg { width:16px; height:16px; }\r\n.icon[data-action=marker][aria-pressed=true] { color:var(--focus); background:color-mix(in srgb,var(--focus) 12%,transparent); }\r\nbutton[data-tip]::after { content:attr(data-tip); position:absolute; bottom:calc(100% + 5px); left:50%; transform:translateX(-50%); width:max-content; max-width:160px; padding:3px 6px; border-radius:4px; background:var(--text); color:var(--surface); font-size:11px; line-height:16px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity 80ms ease-out; z-index:8; }\r\nbutton[data-tip]:hover::after,button[data-tip]:focus-visible::after { opacity:1; }\r\n.tools > :first-child::after { left:0; transform:none; }\r\n.actions > :last-child::after { left:auto; right:0; transform:none; }\r\n.submit { width:auto; display:flex; align-items:center; justify-content:center; gap:6px; padding:0 12px; border-radius:999px; background:var(--text); color:var(--surface); }\r\n.submit:not([data-status]) svg,.submit:not([data-status]) path { fill:currentColor; stroke:none; }\r\n.submit:not(:disabled):hover { opacity:.85; background:var(--text); }\r\n.submit[data-status=accepted] { background:var(--success); color:#fff; }\r\n.precision { width:64px; display:flex; justify-content:center; gap:4px; border-radius:999px; color:var(--muted); font-size:13px; line-height:20px; }\r\n.precision svg { width:16px; height:16px; stroke-width:1.5; }\r\n.precision-check { opacity:0; }\r\n.precision[aria-pressed=true] { color:var(--text); background:var(--control); }\r\n.precision[aria-pressed=true] rect { fill:var(--text); }\r\n.precision[aria-pressed=true] .precision-check { opacity:1; stroke:var(--surface); }\r\n.precision[data-tip]::after { width:220px; max-width:calc(100vw - 32px); white-space:normal; text-align:left; left:auto; right:0; transform:none; }\r\n.time-editor { display:flex; gap:10px; margin-top:8px; }\r\n.field { display:flex; align-items:center; gap:6px; min-width:0; flex:1; height:32px; background:var(--control); border-radius:6px; color:var(--muted); padding-left:8px; font-size:11px; }\r\n.field input { width:100%; height:32px; min-width:0; background:transparent; color:var(--text); border:1px solid transparent; border-radius:5px; padding:4px 6px 4px 0; font-size:12px; line-height:20px; font-variant-numeric:tabular-nums; caret-color:var(--focus); }\r\n.field input[aria-invalid=true] { border-color:var(--error); }\r\n.status { margin:8px 0 0; color:var(--error); }\r\n.status:empty { display:none; }\r\n::selection { background:var(--focus); color:#fff; }\r\n@media(prefers-color-scheme:dark) { :host { --surface:#232427; --text:#e4e5e7; --muted:#a5a8ad; --control:#2b2c2f; --hover:#36383c; --line:#2e3033; --focus:#3d9aff; --success:#3cbb72; --error:#ee5c61; } }\r\n@media(max-width:420px) { .controls { -webkit-user-select:none; user-select:none; padding:8px; } .control-row,.tools,.actions { gap:4px; } }\r\n@media(prefers-reduced-motion:reduce) { button > svg,button > img,.download-icon,.download-icon svg,.download-label,.toolbar,.toolbar .download,.toolbar .select { transition:none!important; } .toolbar .select { transform:none!important; } .band { transition-duration:60ms; } }\r\n';

  // ../assets/brand/tray/macos/ameow-menu-bar-white.svg
  var ameow_menu_bar_white_default = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">\r\n<path d="M14.3649 4.58407C14.6302 4.48206 14.9167 4.44176 15.1208 4.64559C15.5697 5.09463 15.753 6.13568 15.8347 7.09481C15.9339 8.14652 15.8567 9.13938 15.5524 9.88778C15.7592 10.2041 15.9204 10.5184 16.0388 10.8097V10.8145C16.1573 10.8402 16.2746 10.8731 16.3864 10.9122C16.9371 11.0958 17.304 11.4022 17.447 11.8917C17.5898 12.3815 17.4269 12.9122 17.1208 13.1163C16.7943 13.3203 16.4066 13.2185 16.1413 12.9737C15.8351 13.2594 15.2223 13.1774 14.9978 12.8917C14.6712 13.0547 14.2428 12.9323 14.0388 12.6671C13.9634 12.5809 13.905 12.4839 13.862 12.3819H4.03096C3.98819 12.5312 3.91609 12.6667 3.81318 12.7696C3.56826 12.9941 3.2409 12.9524 3.03681 12.7891C2.996 13.1157 2.32288 13.2388 1.89424 12.9532C1.71044 13.2387 1.11848 13.2592 0.832713 12.9737C0.547192 12.7084 0.424261 12.2588 0.54658 11.8712C0.62827 11.4019 1.01671 11.0754 1.48603 10.8917C1.63765 10.8297 1.78949 10.7864 1.94111 10.7608C2.03821 10.5036 2.19666 10.203 2.41279 9.88973C2.01959 8.91402 2.0463 7.31603 2.26142 6.29891C2.38389 5.70707 2.60832 5.07393 2.85322 4.78817C3.07751 4.48232 3.3635 4.48217 3.62861 4.56356C4.85318 4.8697 6.0987 6.05401 6.99678 7.11532V7.13485C8.2009 6.88996 9.63005 6.89097 10.9362 7.13583C10.9436 7.13711 10.9513 7.13843 10.9587 7.13973L10.9567 7.13583C11.8751 6.09499 13.2424 5.0332 14.3649 4.58407ZM12.2019 9.05966C11.5081 9.05973 11.0185 9.49168 10.8347 10.0548C10.7122 10.4491 10.7329 10.7874 10.8962 11.0128C11.2843 11.4069 12.8555 11.4068 13.3249 11.0313C13.4675 10.9374 13.5087 10.7687 13.5495 10.5811C13.8148 10.1117 13.6105 9.64166 13.2839 9.39755C12.9777 9.11599 12.5692 9.04088 12.2019 9.05966ZM5.73213 9.05966C5.36472 9.0221 4.95617 9.1161 4.62959 9.37899C4.30312 9.64194 4.11917 10.1677 4.38447 10.6182C4.42529 10.8246 4.48679 10.9558 4.62959 11.0684C5.13987 11.4065 6.65008 11.3874 7.0583 11.0118C7.2214 10.8052 7.24215 10.4114 7.11982 10.0548C6.93616 9.51031 6.44629 9.05983 5.73213 9.05966Z" fill-rule="evenodd" clip-rule="evenodd" fill="white"/>\r\n</svg>\r\n';

  // src/icons/scissors.svg
  var scissors_default = '<svg\r\n  xmlns="http://www.w3.org/2000/svg"\r\n  width="24"\r\n  height="24"\r\n  viewBox="0 0 24 24"\r\n  fill="none"\r\n  stroke="currentColor"\r\n  stroke-width="2"\r\n  stroke-linecap="round"\r\n  stroke-linejoin="round"\r\n>\r\n  <circle cx="6" cy="6" r="3" />\r\n  <path d="M8.12 8.12 12 12" />\r\n  <path d="M20 4 8.12 15.88" />\r\n  <circle cx="6" cy="18" r="3" />\r\n  <path d="M14.8 14.8 20 20" />\r\n</svg>\r\n';

  // src/icons/marker-range-in.svg
  var marker_range_in_default = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3.7574 1.4875H7V12.5125L3.1088 8.6213V2.136a0.6485 0.6485 0 0 1 0.6486 -0.6485Z" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>\r\n';

  // src/icons/marker-range-out.svg
  var marker_range_out_default = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1.4875h3.2426a0.6485 0.6485 0 0 1 0.6486 0.6485v6.4853L7 12.5125Z" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>\r\n';

  // src/page.mjs
  var icons = {
    select: scissors_default,
    markerIn: marker_range_in_default,
    markerOut: marker_range_out_default,
    marker: '<svg viewBox="0 0 24 24"><path d="M7 3h10a1 1 0 0 1 1 1v10l-6 6-6-6V4a1 1 0 0 1 1-1Z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>',
    focus: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="M9 9h6v6H9Z"/></svg>',
    whole: '<svg viewBox="0 0 24 24"><path d="M3 8V3h5m8 0h5v5M3 16v5h5m13-5v5h-5"/></svg>',
    download: ameow_menu_bar_white_default,
    waiting: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14m8-14v14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
    precision: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3"/><path class="precision-check" d="m5 8 2 2 4-4"/></svg>'
  };
  var errors = {
    E_CLIP_UNSUPPORTED: "\u6D4F\u89C8\u5668\u8FDE\u63A5\u6216\u684C\u9762\u7248\u672C\u4E0D\u652F\u6301\u6B64\u529F\u80FD\uFF0C\u8BF7\u66F4\u65B0\u540C\u4E00\u5019\u9009\u540E\u91CD\u8BD5\u3002",
    E_CLIP_RANGE: "\u8BF7\u8BBE\u7F6E\u6709\u6548\u7684\u5165\u70B9\u548C\u51FA\u70B9\uFF0C\u51FA\u70B9\u987B\u665A\u4E8E\u5165\u70B9\u4E14\u4E0D\u8D85\u51FA\u89C6\u9891\u3002",
    E_PAGE_TARGET: "\u5F53\u524D\u64AD\u653E\u76EE\u6807\u5DF2\u53D8\u5316\u6216\u65E0\u6CD5\u51C6\u786E\u5BF9\u5E94\uFF0C\u8BF7\u56DE\u5230\u5355\u4E2A\u70B9\u64AD\u89C6\u9891\u3002",
    E_PAGE_DISABLED: "\u9875\u9762\u5DE5\u5177\u5DF2\u5173\u95ED\uFF0C\u8BF7\u4ECE\u6269\u5C55\u91CD\u65B0\u542F\u7528\u3002",
    E_NOT_RUNNING: "\u672A\u8FDE\u63A5\u5230 Ameow\uFF0C\u8BF7\u542F\u52A8\u684C\u9762\u5E94\u7528\u540E\u91CD\u8BD5\u3002",
    E_REQUEST_REJECTED: "Ameow \u672A\u53D7\u7406\uFF0C\u8BF7\u5728\u684C\u9762\u67E5\u770B\u662F\u5426\u5DF2\u6709\u76F8\u540C\u4EFB\u52A1\u6216\u6B63\u5728\u9000\u51FA\u3002",
    E_APP_UPDATE_BUSY: "Ameow \u6B63\u5728\u66F4\u65B0\u6216\u9000\u51FA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002"
  };
  async function request(action, data = {}) {
    const reply = await chrome.runtime.sendMessage({ action, ...data });
    if (!reply?.ok) throw Error(reply?.error || "E_BRIDGE");
    return reply.value;
  }
  function shadow(host, html) {
    const root = host.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(page_ui_default);
    root.adoptedStyleSheets = [sheet];
    root.innerHTML = html;
    return root;
  }
  function iconButton(root, action, label, icon, className = "icon") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    root.append(button);
    return button;
  }
  function mediaForPage(boundVideo) {
    const selector = location.hostname === "www.youtube.com" ? "#movie_player" : ".bpx-player-container";
    const roots = [...document.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().width > 120);
    if (roots.length !== 1) return null;
    const media = [...roots[0].querySelectorAll("video, bwp-video")].filter((el) => el.getBoundingClientRect().width > 120 && el.getBoundingClientRect().height > 60);
    const video = media[0];
    const ready = video && (video.readyState >= 2 || video === boundVideo && video.readyState >= 1);
    return media.length === 1 && ready && Number.isFinite(video.duration) && video.duration > 0 ? { player: roots[0], video } : null;
  }
  var PageVideoTools = class {
    constructor() {
      this.binding = null;
      this.draft = { start_ms: null, end_ms: null };
      this.precise = false;
      this.pending = false;
      this.stopped = false;
      this.motion = matchMedia("(prefers-reduced-motion: reduce)");
      this.onVisibility = () => {
        this.syncNativeFeedback();
        if (!document.hidden) void this.refresh();
      };
      document.addEventListener("visibilitychange", this.onVisibility);
      this.onResize = () => {
        if (this.dialog && !this.closing) this.fitPeek();
      };
      window.addEventListener("resize", this.onResize);
      this.onStop = (message) => {
        if (message.action === "page-stop") this.stop();
      };
      chrome.runtime.onMessage.addListener(this.onStop);
      this.schedule();
    }
    schedule() {
      if (this.stopped) return;
      void this.refresh().finally(() => {
        if (!this.stopped) this.timer = setTimeout(() => this.schedule(), 800);
      });
    }
    async refresh() {
      if (document.hidden || this.refreshing) return;
      this.refreshing = true;
      try {
        const media = mediaForPage(this.video);
        const target = media ? await request("page-binding") : null;
        if (this.stopped) return;
        if (!media || !target || Math.abs(target.duration - media.video.duration) > 0.5) {
          this.unbind();
          return;
        }
        if (this.binding?.key !== target.key || this.video !== media.video || this.player !== media.player) {
          const changed = this.binding?.key !== target.key;
          this.unbind();
          if (changed) {
            this.draft = { start_ms: null, end_ms: null };
            this.precise = false;
          }
          this.binding = target;
          this.video = media.video;
          this.player = media.player;
          this.mount();
        } else this.binding = target;
        this.syncNativeFeedback();
      } catch (error) {
        this.unbind();
        if (error.message === "E_PAGE_DISABLED") this.stop();
      } finally {
        this.refreshing = false;
      }
    }
    mount() {
      this.host = document.createElement("ameow-page-tools");
      this.host.style.cssText = "position:absolute;top:10px;right:10px;z-index:2147483646;display:block;width:156px;height:32px;pointer-events:none";
      this.position = this.player.style.getPropertyValue("position");
      this.positionPriority = this.player.style.getPropertyPriority("position");
      this.positionChanged = getComputedStyle(this.player).position === "static";
      if (this.positionChanged) this.player.style.setProperty("position", "relative");
      this.player.append(this.host);
      this.root = shadow(this.host, '<div class="toolbar"><div class="capsule"></div><div class="feedback" role="status" aria-live="polite"></div></div>');
      this.toolbar = this.root.querySelector(".toolbar");
      for (const event of ["click", "pointerdown"]) this.toolbar.addEventListener(event, (e) => e.stopPropagation());
      this.select = iconButton(this.toolbar, "peek", "\u5207\u7247", icons.select + "<span>\u5207\u7247</span>", "select");
      this.select.tabIndex = -1;
      this.select.inert = true;
      this.download = iconButton(this.toolbar, "download", "\u4E0B\u8F7D", '<span class="download-icon">' + ameow_menu_bar_white_default + '</span><span class="download-label">\u4E0B\u8F7D</span>', "download");
      this.select.onclick = () => this.openPeek();
      this.download.onclick = () => void this.submit(null);
      this.toolbar.addEventListener("mouseenter", () => this.wake());
      this.toolbar.addEventListener("mouseleave", () => this.rest());
      this.toolbar.addEventListener("focusin", () => this.wake());
      this.toolbar.addEventListener("focusout", () => queueMicrotask(() => this.rest()));
      this.intersection = new IntersectionObserver((entries) => {
        this.host.style.visibility = entries[0].isIntersecting ? "" : "hidden";
        this.syncNativeFeedback();
      });
      this.feedbackObserver = new MutationObserver(() => this.syncNativeFeedback());
      this.feedbackObserver.observe(this.player, { childList: true, subtree: true });
      this.visibilityObserver = new MutationObserver(() => this.syncNativeFeedback());
      for (let node = this.host; node; node = node.parentElement) {
        this.visibilityObserver.observe(node, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      }
      this.visibilityObserver.observe(this.toolbar, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      this.intersection.observe(this.player);
      this.rest();
    }
    restoreNativeFeedback() {
      const saved = this.nativeFeedback;
      if (!saved) return;
      this.nativeFeedback = null;
      if (saved.value) saved.button.style.setProperty("visibility", saved.value, saved.priority);
      else saved.button.style.removeProperty("visibility");
    }
    syncNativeFeedback() {
      const buttons = location.hostname === "www.bilibili.com" ? this.player?.querySelectorAll(".bpx-player-top-issue") : null;
      const button = buttons?.length === 1 ? buttons[0] : null;
      const visible = !document.hidden && !this.dialog && this.host?.isConnected && this.toolbar?.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
      if (this.nativeFeedback && (!visible || button !== this.nativeFeedback.button)) this.restoreNativeFeedback();
      if (visible && button && !this.nativeFeedback) {
        this.nativeFeedback = { button, value: button.style.getPropertyValue("visibility"), priority: button.style.getPropertyPriority("visibility") };
        button.style.setProperty("visibility", "hidden", "important");
      }
    }
    held() {
      return this.toolbar?.matches(":hover") || Boolean(this.root?.activeElement);
    }
    wake() {
      clearTimeout(this.collapseTimer);
      clearTimeout(this.dimTimer);
      this.toolbar.removeAttribute("data-dim");
      this.toolbar.setAttribute("data-expanded", "");
      this.select.inert = false;
      this.select.tabIndex = 0;
    }
    rest() {
      if (this.held()) return;
      clearTimeout(this.collapseTimer);
      this.collapseTimer = setTimeout(() => {
        if (this.held()) return;
        this.toolbar?.removeAttribute("data-expanded");
        if (this.select) {
          this.select.inert = true;
          this.select.tabIndex = -1;
        }
        clearTimeout(this.dimTimer);
        this.dimTimer = setTimeout(() => {
          if (!this.held() && !this.pending) this.toolbar?.setAttribute("data-dim", "");
        }, 2e3);
      }, 400);
    }
    async submit(clip) {
      if (this.pending || !this.binding) return;
      let range = null;
      try {
        if (clip !== null) range = clipRange(clip, this.video.duration);
      } catch (error) {
        this.status(errors[error.message]);
        return;
      }
      const bound = this.binding;
      this.pending = true;
      this.wake();
      this.toolbar.dataset.status = "pending";
      this.download.disabled = true;
      if (this.submitButton) {
        this.submitButton.disabled = true;
        this.setSubmitStatus("pending");
      }
      if (this.precisionButton) this.precisionButton.disabled = true;
      this.status("");
      try {
        await request("page-submit", { key: bound.key, url: bound.url, clip: range, request_id: crypto.randomUUID() });
        if (this.binding?.key !== bound.key || this.stopped) return;
        this.toolbar.dataset.status = "accepted";
        this.download.querySelector(".download-icon").innerHTML = icons.check;
        this.download.setAttribute("aria-label", "\u5DF2\u52A0\u5165\u961F\u5217");
        if (this.submitButton) this.setSubmitStatus("accepted");
        clearTimeout(this.ackTimer);
        this.ackTimer = setTimeout(() => {
          if (this.download) {
            this.download.querySelector(".download-icon").innerHTML = ameow_menu_bar_white_default;
            this.download.setAttribute("aria-label", "\u4E0B\u8F7D");
          }
          if (this.toolbar) delete this.toolbar.dataset.status;
          if (this.submitButton) this.setSubmitStatus();
          this.updateFields();
          this.rest();
        }, 1600);
      } catch (error) {
        if (this.binding?.key === bound.key) {
          this.status(errors[error.message] || "\u8FDE\u63A5\u672A\u786E\u8BA4\u53D7\u7406\u3002\u8BF7\u68C0\u67E5\u684C\u9762\u961F\u5217\u540E\u518D\u91CD\u8BD5\u3002");
          delete this.toolbar.dataset.status;
        }
      } finally {
        this.pending = false;
        if (this.download) this.download.disabled = false;
        if (this.submitButton && this.submitButton.dataset.status !== "accepted") this.setSubmitStatus();
        this.updateFields();
        this.rest();
      }
    }
    status(text) {
      const output = this.controls?.querySelector(".status") || this.root?.querySelector(".feedback");
      if (output) output.textContent = text || "";
    }
    openPeek() {
      if (!this.binding || !this.player.isConnected) return;
      if (this.dialog) return;
      this.view = null;
      this.returnFocus = this.root.activeElement || document.activeElement;
      this.savedScroll = { left: window.scrollX, top: window.scrollY, behavior: "instant" };
      const from = this.player.getBoundingClientRect();
      this.sourceAspect = from.width / from.height;
      this.placeholder = document.createElement("div");
      this.placeholder.style.cssText = "width:" + from.width + "px;height:" + from.height + "px;pointer-events:none";
      this.player.before(this.placeholder);
      this.savedStyle = this.player.getAttribute("style");
      this.savedControls = this.video.controls;
      this.savedOverflow = document.documentElement.style.getPropertyValue("overflow");
      this.savedOverflowPriority = document.documentElement.style.getPropertyPriority("overflow");
      document.documentElement.style.setProperty("overflow", "hidden", "important");
      this.dialog = document.createElement("dialog");
      this.dialog.className = "ameow-peek";
      this.restoreNativeFeedback();
      this.dialog.setAttribute("aria-label", "Ameow \u9009\u62E9\u7247\u6BB5");
      this.stage = document.createElement("div");
      this.stage.className = "ameow-peek-stage";
      this.dialog.append(this.stage);
      document.body.append(this.dialog);
      const playing = !this.video.paused;
      this.stage.append(this.player);
      this.player.classList.add("ameow-peek-player");
      this.video.controls = false;
      const host = document.createElement("ameow-peek-controls");
      this.dialog.append(host);
      this.controls = shadow(host, '<div class="controls"><div class="timeline"><div class="track"><div class="ticks" aria-hidden="true"></div><div class="rail"></div><div class="buffered" aria-hidden="true"></div><div class="band"></div><input type="range" min="0" step="0.001" aria-label="\u64AD\u653E\u4F4D\u7F6E"><button type="button" class="handle in" role="slider" aria-label="\u62D6\u52A8\u5165\u70B9" aria-valuemin="0"></button><button type="button" class="handle out" role="slider" aria-label="\u62D6\u52A8\u51FA\u70B9" aria-valuemin="0"></button><div class="playhead" aria-hidden="true"></div><button type="button" class="range-body" role="slider" aria-label="\u5E73\u79FB\u9009\u533A" aria-valuemin="0" hidden></button><output class="time-bubble" id="marker-time" role="tooltip" hidden></output></div><div class="track-times"><span class="time"></span><span class="buffering" role="status"></span><span class="duration" aria-live="polite"></span></div></div><div class="control-row"><div class="tools"></div><div class="actions"></div></div><div class="time-editor" hidden><label class="field">I<input id="clip-in" inputmode="decimal" placeholder="\u5165\u70B9" aria-label="\u5165\u70B9\u65F6\u95F4" autocomplete="off" spellcheck="false"></label><label class="field">O<input id="clip-out" inputmode="decimal" placeholder="\u51FA\u70B9" aria-label="\u51FA\u70B9\u65F6\u95F4" autocomplete="off" spellcheck="false"></label></div><p class="status" role="status" aria-live="polite"></p></div>');
      for (const event of ["click", "pointerdown"]) this.controls.addEventListener(event, (e) => e.stopPropagation());
      const tools = this.controls.querySelector(".tools"), actions = this.controls.querySelector(".actions");
      const tool = (root, action, label, svg, className = "icon") => {
        const button = iconButton(root, action, label, svg, className);
        button.dataset.tip = label;
        return button;
      };
      this.playButton = tool(tools, "play", "\u64AD\u653E", icons.play);
      this.playButton.onclick = () => this.togglePlayback();
      this.markerButton = tool(tools, "marker", "\u6DFB\u52A0\u6807\u8BB0", icons.marker);
      this.markerButton.onclick = () => this.markCurrent();
      const edit = tool(tools, "edit", "\u7F16\u8F91\u9009\u533A\u65F6\u95F4", icons.edit);
      edit.setAttribute("aria-expanded", "false");
      edit.onclick = () => {
        const editor = this.controls.querySelector(".time-editor");
        editor.hidden = !editor.hidden;
        edit.setAttribute("aria-expanded", String(!editor.hidden));
        this.fitPeek();
        if (!editor.hidden) this.inputs[0].focus({ preventScroll: true });
        else edit.focus({ preventScroll: true });
      };
      tool(tools, "view", "\u805A\u7126\u9009\u533A", icons.focus, "icon view-toggle");
      this.precisionButton = iconButton(actions, "precise", "\u7CBE\u786E\u5207\u5206", icons.precision + "<span>\u7CBE\u786E</span>", "icon precision");
      this.precisionButton.onclick = () => {
        if (this.pending) return;
        this.precise = !this.precise;
        this.updateFields();
        this.status("");
      };
      this.submitButton = tool(actions, "submit", "\u4E0B\u8F7D\u7247\u6BB5", icons.download + '<span aria-hidden="true">\u4E0B\u8F7D</span>', "icon submit");
      this.submitButton.onclick = () => void this.submit({ ...this.draft, ...this.precise ? { precise: true } : {} });
      this.seek = this.controls.querySelector(".track input");
      this.seek.max = this.video.duration;
      this.seek.oninput = () => {
        this.video.currentTime = Number(this.seek.value);
        this.updatePlayback();
      };
      this.inputs = [this.controls.querySelector("#clip-in"), this.controls.querySelector("#clip-out")];
      this.sliders = [...this.controls.querySelectorAll(".handle")];
      for (const [index, key] of ["start_ms", "end_ms"].entries()) {
        const input = this.inputs[index];
        input.value = formatTime(this.draft[key]);
        input.oninput = () => {
          this.draft[key] = parseTime(input.value);
          this.updateFields();
          this.status("");
        };
        input.onchange = () => {
          if (this.draft[key] !== null) input.value = formatTime(this.draft[key]);
        };
      }
      this.setupMarkerHandles();
      this.setupTimeline();
      this.controls.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") e.stopPropagation();
      });
      this.handledKeys = /* @__PURE__ */ new Set();
      this.keydown = (e) => {
        if (!this.controls) return;
        const path = e.composedPath(), editing = path.some((n) => n instanceof Element && n.matches("input:not([type=range]),textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"));
        const interactive = path.some((n) => n instanceof Element && n.matches("input,button,select,textarea,a[href],[contenteditable]:not([contenteditable='false']),[role='button'],[role='slider']"));
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.closePeek();
        } else if (!editing && !e.ctrlKey && !e.metaKey && !e.altKey && ["i", "o", "I", "O"].includes(e.key)) {
          this.handledKeys.add(e.code);
          e.preventDefault();
          e.stopImmediatePropagation();
          this.setMark(e.key.toLowerCase() === "i" ? "start_ms" : "end_ms");
        } else if (!interactive && e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.handledKeys.add(e.code);
          e.preventDefault();
          e.stopImmediatePropagation();
          this.togglePlayback();
        } else if (path.includes(this.controls.host) && [" ", "Enter"].includes(e.key)) {
          this.handledKeys.add(e.code);
          e.stopImmediatePropagation();
        }
      };
      this.keyup = (e) => {
        if (this.handledKeys.delete(e.code)) e.stopImmediatePropagation();
      };
      window.addEventListener("keydown", this.keydown, true);
      window.addEventListener("keyup", this.keyup, true);
      this.dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        this.closePeek();
      });
      this.dialog.addEventListener("click", (e) => {
        const r = this.dialog.getBoundingClientRect();
        if (e.target === this.dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.closePeek();
      });
      this.onTime = () => this.updatePlayback();
      for (const event of ["timeupdate", "play", "pause", "seeked", "seeking", "waiting", "playing", "progress", "durationchange"]) this.video.addEventListener(event, this.onTime);
      this.dialog.showModal();
      this.fitPeek();
      window.dispatchEvent(new Event("resize"));
      this.dialog.setAttribute("data-transition", "");
      const dialog = this.dialog;
      const entry = this.animateStage(from, this.stage.getBoundingClientRect(), this.motion.matches ? 0 : 200);
      if (entry) entry.finished.then(() => {
        if (this.dialog === dialog && !this.closing) dialog.removeAttribute("data-transition");
      }, () => {
      });
      else dialog.removeAttribute("data-transition");
      host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.motion.matches ? 60 : 180 });
      this.updateFields();
      this.updatePlayback();
      this.playButton.focus({ preventScroll: true });
      if (playing && this.video.paused) this.togglePlayback();
    }
    setSubmitStatus(state) {
      if (!this.submitButton) return;
      if (state) this.submitButton.dataset.status = state;
      else delete this.submitButton.dataset.status;
      const label = state === "pending" ? "\u7B49\u5F85 Ameow \u53D7\u7406\u2026" : state === "accepted" ? "\u5DF2\u52A0\u5165\u961F\u5217" : "\u4E0B\u8F7D\u7247\u6BB5";
      this.submitButton.setAttribute("aria-label", label);
      this.submitButton.dataset.tip = label;
      this.submitButton.innerHTML = (state === "pending" ? icons.waiting : state === "accepted" ? icons.check : icons.download) + '<span aria-hidden="true">\u4E0B\u8F7D</span>';
    }
    markCurrent() {
      if (this.draft.start_ms !== null || this.draft.end_ms !== null) this.clearSelection();
      else this.setDraft(Math.round(this.video.currentTime * 1e3), null);
    }
    setDraft(start, end) {
      this.draft = { start_ms: start, end_ms: end };
      this.status("");
      if (this.inputs) {
        this.inputs[0].value = formatTime(start);
        this.inputs[1].value = formatTime(end);
      }
      this.updateFields();
    }
    setupMarkerHandles() {
      const keys = ["start_ms", "end_ms"];
      for (const [index, handle] of this.sliders.entries()) {
        handle.innerHTML = icons.marker;
        handle.setAttribute("aria-describedby", "marker-time");
        const time = () => this.draft[keys[index]];
        const tip = () => {
          if (time() !== null) this.showTrackTime(time(), (index ? "\u51FA\u70B9 " : "\u5165\u70B9 ") + formatTime(time()));
        };
        handle.onfocus = tip;
        handle.onpointerenter = handle.onpointermove = (e) => {
          if (this.draggingTrack) return;
          if (handle.classList.contains("single")) handle.dataset.side = e.clientX < handle.getBoundingClientRect().left + handle.clientWidth / 2 ? "in" : "out";
          tip();
        };
        handle.onpointerdown = (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          handle.focus({ preventScroll: true });
          handle.setPointerCapture(e.pointerId);
          const single = this.draft.start_ms === null || this.draft.end_ms === null;
          const anchor = this.draft.start_ms ?? this.draft.end_ms;
          const rect = handle.getBoundingClientRect();
          const selected = single ? e.clientX < rect.left + rect.width / 2 ? 0 : 1 : index;
          const from = this.draft[keys[index]], other = this.draft[keys[1 - index]], origin = e.clientX;
          const width = this.controls.querySelector(".track").clientWidth, span = this.timeWindow().span * 1e3;
          const show = (value) => this.showTrackTime(value, (selected ? "\u51FA\u70B9 " : "\u5165\u70B9 ") + formatTime(value));
          handle.dataset.side = selected ? "out" : "in";
          this.draggingTrack = true;
          handle.dataset.dragging = "";
          show(from);
          const drag = (event) => {
            let value = Math.max(0, Math.min(Math.round(this.video.duration * 1e3), Math.round(from + (event.clientX - origin) / width * span)));
            if (single) {
              if (selected === 0 && value < anchor) this.setDraft(value, anchor);
              else if (selected === 1 && value > anchor) this.setDraft(anchor, value);
              else return;
            } else {
              if (other !== null) value = index ? Math.max(other + 1, value) : Math.min(other - 1, value);
              this.setMark(keys[index], value);
            }
            if (this.controls.activeElement !== this.sliders[selected]) this.sliders[selected].focus({ preventScroll: true });
            delete handle.dataset.dragging;
            this.sliders[selected].dataset.dragging = "";
            show(value);
          };
          const hover = handle.onpointermove;
          handle.onpointermove = drag;
          const finish = (event) => {
            handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = null;
            handle.onpointermove = hover;
            this.draggingTrack = false;
            delete handle.dataset.dragging;
            delete this.sliders[selected].dataset.dragging;
            if (event.type === "pointerup" && this.controls && !this.closing) {
              const edited = this.draft[keys[selected]] === null ? index : selected;
              this.sliders[edited].focus({ preventScroll: true });
              const value = this.draft[keys[edited]];
              this.showTrackTime(value, (edited ? "\u51FA\u70B9 " : "\u5165\u70B9 ") + formatTime(value));
            } else this.hideTrackTime();
          };
          handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = finish;
        };
        handle.onkeydown = (e) => {
          const value = time();
          if (value === null) return;
          const delta = e.shiftKey ? 1e3 : 1;
          let next = { ArrowLeft: value - delta, ArrowDown: value - delta, ArrowRight: value + delta, ArrowUp: value + delta, Home: 0, End: Math.round(this.video.duration * 1e3) }[e.key];
          if (next === void 0) return;
          e.preventDefault();
          next = Math.max(0, Math.min(Math.round(this.video.duration * 1e3), next));
          const other = this.draft[keys[1 - index]];
          if (other !== null) next = index ? Math.max(other + 1, next) : Math.min(other - 1, next);
          this.setMark(keys[index], next);
          tip();
        };
      }
    }
    setupTimeline() {
      const track = this.controls.querySelector(".track"), body = this.controls.querySelector(".range-body");
      const at = (x) => Math.max(0, Math.min(this.video.duration * 1e3, (this.timeWindow().start + (x - track.getBoundingClientRect().left) / track.clientWidth * this.timeWindow().span) * 1e3));
      track.addEventListener("pointermove", (e) => {
        if (!this.draggingTrack && !e.target.closest(".handle")) this.showTrackTime(at(e.clientX));
      });
      track.addEventListener("pointerleave", () => {
        if (!this.draggingTrack) this.hideTrackTime();
      });
      track.addEventListener("pointerdown", (e) => {
        if (e.target === track || e.target.matches(".ticks,.ticks span")) {
          this.video.currentTime = at(e.clientX) / 1e3;
          this.updatePlayback();
        }
      });
      const head = this.controls.querySelector(".playhead");
      head.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        head.setPointerCapture(e.pointerId);
        this.seek.focus({ preventScroll: true });
        const seekTo = (x) => {
          this.seek.value = at(x) / 1e3;
          this.video.currentTime = Number(this.seek.value);
          this.updatePlayback();
          this.showTrackTime(this.video.currentTime * 1e3);
        };
        this.draggingTrack = true;
        seekTo(e.clientX);
        head.onpointermove = (event) => seekTo(event.clientX);
        head.onpointerup = head.onpointercancel = head.onlostpointercapture = () => {
          head.onpointermove = null;
          this.draggingTrack = false;
          this.hideTrackTime();
        };
      };
      const shift = (delta, start = this.draft.start_ms, end = this.draft.end_ms) => {
        if (start === null || end === null || end <= start) return;
        delta = Math.max(-start, Math.min(Math.round(this.video.duration * 1e3) - end, Math.round(delta)));
        this.draft = { start_ms: start + delta, end_ms: end + delta };
        this.inputs[0].value = formatTime(this.draft.start_ms);
        this.inputs[1].value = formatTime(this.draft.end_ms);
        this.updateFields();
        this.showTrackTime((this.draft.start_ms + this.draft.end_ms) / 2, formatTime(this.draft.start_ms) + " \u2013 " + formatTime(this.draft.end_ms));
      };
      body.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        body.focus({ preventScroll: true });
        body.setPointerCapture(e.pointerId);
        const start = this.draft.start_ms, end = this.draft.end_ms, origin = e.clientX, width = track.clientWidth;
        this.draggingTrack = true;
        body.setAttribute("data-dragging", "");
        body.onpointermove = (event) => {
          if (Math.abs(event.clientX - origin) >= 3) shift((event.clientX - origin) / width * this.timeWindow().span * 1e3, start, end);
        };
        body.onpointerup = body.onpointercancel = body.onlostpointercapture = () => {
          body.onpointermove = null;
          this.draggingTrack = false;
          body.removeAttribute("data-dragging");
          this.hideTrackTime();
        };
      };
      body.onkeydown = (e) => {
        const delta = e.shiftKey ? 1e3 : 1;
        const move = { ArrowLeft: -delta, ArrowDown: -delta, ArrowRight: delta, ArrowUp: delta, Home: -this.draft.start_ms, End: this.video.duration * 1e3 - this.draft.end_ms }[e.key];
        if (move !== void 0) {
          e.preventDefault();
          shift(move);
        }
      };
      this.controls.querySelector(".view-toggle").onclick = () => {
        if (this.view) this.view = null;
        else {
          const single = this.draft.start_ms === null || this.draft.end_ms === null;
          const anchor = (this.draft.start_ms ?? this.draft.end_ms) / 1e3;
          const length = single ? 0 : (this.draft.end_ms - this.draft.start_ms) / 1e3, padding = single ? 4 : Math.max(0.75, length * 0.6);
          const span = Math.min(this.video.duration, length + padding * 2);
          const start = Math.max(0, Math.min(this.video.duration - span, anchor - padding));
          this.view = { start, end: start + span };
        }
        this.hideTrackTime();
        this.updateFields();
        this.updatePlayback();
      };
      this.seek.addEventListener("input", () => this.showTrackTime(Number(this.seek.value) * 1e3));
      this.seek.addEventListener("change", () => this.hideTrackTime());
      this.controls.addEventListener("focusout", () => queueMicrotask(() => this.hideTrackTime()));
      this.renderTicks();
    }
    timeWindow() {
      const start = this.view?.start ?? 0, end = this.view?.end ?? this.video.duration;
      return { start, end, span: end - start };
    }
    trackPercent(ms) {
      const window2 = this.timeWindow();
      return (ms / 1e3 - window2.start) / window2.span * 100;
    }
    renderTicks() {
      if (!this.controls) return;
      const track = this.controls.querySelector(".track"), ticks = track.querySelector(".ticks");
      const window2 = this.timeWindow(), duration = window2.span, width = track.clientWidth;
      const target = duration / Math.max(1, Math.floor(width / 62));
      const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 14400, 86400].find((n) => n >= target) || duration;
      const signature = window2.start + ":" + duration + ":" + width + ":" + step;
      if (ticks.dataset.signature === signature) return;
      ticks.dataset.signature = signature;
      ticks.replaceChildren();
      for (let time = Math.ceil(window2.start / step) * step; time <= window2.end; time += step) {
        const tick = document.createElement("span");
        tick.style.left = this.trackPercent(time * 1e3) + "%";
        tick.textContent = formatTime(time * 1e3).replace(/\.\d{3}$/, "");
        ticks.append(tick);
      }
    }
    showTrackTime(ms, text = formatTime(ms)) {
      const bubble = this.controls?.querySelector(".time-bubble");
      if (!bubble) return;
      const duration = this.draft.end_ms - this.draft.start_ms;
      if (this.draggingTrack && duration > 0) text += " \xB7 " + formatTime(duration);
      bubble.textContent = text;
      bubble.hidden = false;
      const percent = Math.max(0, Math.min(100, this.trackPercent(ms)));
      bubble.style.left = percent + "%";
      const track = bubble.parentElement;
      const half = bubble.getBoundingClientRect().width / 2;
      const center = percent / 100 * track.clientWidth;
      bubble.style.transform = "translateX(" + Math.max(-center, Math.min(-half, track.clientWidth - center - half * 2)) + "px)";
    }
    hideTrackTime() {
      const active = this.controls?.activeElement;
      if (active?.matches(".handle") && !active.hidden && !this.closing) {
        const out = active.classList.contains("out"), value = this.draft[out ? "end_ms" : "start_ms"];
        this.showTrackTime(value, (out ? "\u51FA\u70B9 " : "\u5165\u70B9 ") + formatTime(value));
        return;
      }
      const bubble = this.controls?.querySelector(".time-bubble");
      if (bubble) bubble.hidden = true;
    }
    animateStage(from, to, duration) {
      this.animation?.cancel();
      if (!duration || !to.width || !to.height) return null;
      const dx = from.left - to.left, dy = from.top - to.top;
      this.animation = this.stage.animate([
        { transform: "translate(" + dx + "px," + dy + "px) scale(" + from.width / to.width + "," + from.height / to.height + ")" },
        { transform: "none" }
      ], { duration, easing: "cubic-bezier(.16,1,.3,1)" });
      return this.animation;
    }
    fitPeek() {
      const margin = innerWidth < 600 ? 16 : 48;
      const maxWidth = Math.min(1040, innerWidth - margin), maxHeight = Math.min(780, innerHeight - (innerWidth < 600 ? 32 : 48));
      for (let pass = 0; pass < 3; pass++) {
        const footer = this.controls.host.getBoundingClientRect().height;
        const height = Math.max(60, Math.min(maxHeight - footer, maxWidth / this.sourceAspect));
        this.dialog.style.setProperty("width", height * this.sourceAspect + "px", "important");
        this.dialog.style.setProperty("height", height + footer + "px", "important");
      }
      this.renderTicks();
    }
    closePeek(immediate = false) {
      if (!this.dialog || this.closing && !immediate) return;
      const dialog = this.dialog;
      if (immediate || this.motion.matches || !this.placeholder?.isConnected) {
        this.restorePeek();
        return;
      }
      this.closing = true;
      dialog.setAttribute("data-closing", "");
      dialog.setAttribute("data-transition", "");
      const from = this.stage.getBoundingClientRect();
      this.animation?.cancel();
      const base = this.stage.getBoundingClientRect(), to = this.placeholder.getBoundingClientRect();
      const transform = (r) => "translate(" + (r.left - base.left) + "px," + (r.top - base.top) + "px) scale(" + r.width / base.width + "," + r.height / base.height + ")";
      this.animation = this.stage.animate([{ transform: transform(from) }, { transform: transform(to) }], { duration: 110, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
      this.animation.finished.then(() => {
        if (this.dialog === dialog) this.restorePeek();
      }, () => {
      });
    }
    restorePeek() {
      if (!this.dialog) return;
      this.draggingTrack = false;
      this.playbackRequest = (this.playbackRequest ?? 0) + 1;
      window.removeEventListener("keydown", this.keydown, true);
      window.removeEventListener("keyup", this.keyup, true);
      const originalConnected = this.placeholder.isConnected;
      this.animation?.cancel();
      this.animation = null;
      for (const event of ["timeupdate", "play", "pause", "seeked", "seeking", "waiting", "playing", "progress", "durationchange"]) this.video.removeEventListener(event, this.onTime);
      this.player.classList.remove("ameow-peek-player");
      if (this.savedStyle === null) this.player.removeAttribute("style");
      else this.player.setAttribute("style", this.savedStyle);
      this.video.controls = this.savedControls;
      if (!originalConnected) this.video.pause();
      this.placeholder.replaceWith(this.player);
      document.documentElement.style.setProperty("overflow", this.savedOverflow, this.savedOverflowPriority);
      if (originalConnected) this.wake();
      this.dialog.close();
      this.dialog.remove();
      this.dialog = null;
      this.controls = null;
      this.submitButton = null;
      this.closing = false;
      this.syncNativeFeedback();
      window.dispatchEvent(new Event("resize"));
      if (originalConnected) {
        if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
        window.scrollTo(this.savedScroll);
        this.rest();
      }
    }
    togglePlayback() {
      const video = this.video, request2 = this.playbackRequest = (this.playbackRequest ?? 0) + 1;
      if (video.paused) void video.play().catch(() => {
        if (this.controls && this.video === video && this.playbackRequest === request2) this.status("\u64AD\u653E\u672A\u5F00\u59CB\uFF0C\u8BF7\u91CD\u8BD5\u64AD\u653E\u3002");
      });
      else {
        video.pause();
        this.status("");
      }
    }
    setMark(key, value = Math.round(this.video.currentTime * 1e3)) {
      this.draft[key] = value;
      this.status("");
      if (this.inputs) this.inputs[key === "start_ms" ? 0 : 1].value = formatTime(value);
      this.updateFields();
    }
    clearSelection() {
      this.view = null;
      this.draft = { start_ms: null, end_ms: null };
      for (const input of this.inputs) input.value = "";
      this.updateFields();
      this.updatePlayback();
      this.hideTrackTime();
      this.status("");
    }
    updateFields() {
      if (!this.controls) return;
      let valid = false;
      try {
        clipRange(this.draft, this.video.duration);
        valid = true;
      } catch {
      }
      this.submitButton.disabled = !valid || this.pending || this.submitButton.dataset.status === "accepted";
      this.precisionButton.disabled = this.pending;
      this.precisionButton.setAttribute("aria-pressed", String(this.precise));
      this.precisionButton.dataset.tip = this.precise ? "\u7CBE\u786E\u5207\u5206\uFF0C\u6309\u6240\u9009\u65F6\u95F4\u5904\u7406\uFF0C\u53EF\u80FD\u9700\u8981\u91CD\u65B0\u7F16\u7801\uFF0C\u8017\u65F6\u66F4\u957F\u3002" : "\u5FEB\u901F\u5207\u5206\uFF0C\u8FB9\u754C\u53EF\u80FD\u504F\u79FB\u5230\u9644\u8FD1\u5173\u952E\u5E27\u3002";
      this.precisionButton.setAttribute("aria-description", this.precisionButton.dataset.tip);
      const marked = this.draft.start_ms !== null || this.draft.end_ms !== null;
      this.markerButton.setAttribute("aria-pressed", String(marked));
      this.markerButton.setAttribute("aria-label", marked ? "\u6E05\u9664\u6807\u8BB0" : "\u6DFB\u52A0\u6807\u8BB0");
      this.markerButton.dataset.tip = marked ? "\u6E05\u9664\u6807\u8BB0" : "\u6DFB\u52A0\u6807\u8BB0";
      const duration = this.controls.querySelector(".duration");
      duration.textContent = valid ? formatTime(this.draft.end_ms - this.draft.start_ms) : "";
      for (const [index, key] of ["start_ms", "end_ms"].entries()) {
        const ms = this.draft[key] ?? (index ? this.video.duration * 1e3 : 0);
        const handle = this.sliders[index];
        const position = this.trackPercent(ms);
        const shape = valid ? index ? "out" : "in" : "single";
        if (handle.dataset.shape !== shape) {
          handle.dataset.shape = shape;
          handle.innerHTML = valid ? index ? icons.markerOut : icons.markerIn : icons.marker;
        }
        handle.style.left = position + "%";
        handle.hidden = this.draft[key] === null || position < 0 || position > 100;
        handle.classList.toggle("single", this.draft.start_ms === null || this.draft.end_ms === null);
        handle.setAttribute("aria-valuemax", Math.round(this.video.duration * 1e3));
        handle.setAttribute("aria-valuenow", ms);
        handle.setAttribute("aria-valuetext", this.draft[key] === null ? "\u672A\u8BBE\u7F6E" : formatTime(ms));
        handle.toggleAttribute("data-unset", this.draft[key] === null);
        const value = this.draft[key];
        const reversed = this.draft.start_ms !== null && this.draft.end_ms !== null && this.draft.end_ms <= this.draft.start_ms;
        this.inputs[index].setAttribute("aria-invalid", this.inputs[index].value && (value === null || value > this.video.duration * 1e3 || reversed) ? "true" : "false");
      }
      const toggle = this.controls.querySelector(".view-toggle");
      toggle.disabled = this.draft.start_ms === null && this.draft.end_ms === null;
      const label = this.view ? "\u663E\u793A\u5168\u7247" : valid ? "\u805A\u7126\u9009\u533A" : "\u805A\u7126\u6807\u8BB0";
      toggle.innerHTML = this.view ? icons.whole : icons.focus;
      toggle.setAttribute("aria-label", label);
      toggle.dataset.tip = label;
      toggle.setAttribute("aria-pressed", String(Boolean(this.view)));
      const window2 = this.timeWindow();
      this.seek.min = window2.start;
      this.seek.max = window2.end;
      const band = this.controls.querySelector(".band");
      band.style.opacity = valid ? ".22" : "0";
      const body = this.controls.querySelector(".range-body");
      body.hidden = !valid;
      this.controls.querySelector(".track").toggleAttribute("data-selection", valid);
      if (valid) {
        const left = Math.max(0, this.trackPercent(this.draft.start_ms)), right = Math.min(100, this.trackPercent(this.draft.end_ms));
        body.hidden = right <= left;
        band.hidden = right <= left;
        body.style.left = (left + right) / 2 + "%";
        body.style.width = right - left + "%";
        band.style.left = left + "%";
        band.style.right = 100 - right + "%";
        body.setAttribute("aria-valuenow", this.draft.start_ms);
        body.setAttribute("aria-valuemax", this.video.duration * 1e3 - (this.draft.end_ms - this.draft.start_ms));
        body.setAttribute("aria-valuetext", formatTime(this.draft.start_ms) + " \u2013 " + formatTime(this.draft.end_ms));
      } else band.hidden = false;
      this.renderTicks();
    }
    updatePlayback() {
      if (!this.controls) return;
      if (this.controls.activeElement !== this.seek) this.seek.value = this.video.currentTime;
      this.playButton.innerHTML = this.video.paused ? icons.play : icons.pause;
      this.playButton.setAttribute("aria-label", this.video.paused ? "\u64AD\u653E" : "\u6682\u505C");
      this.playButton.dataset.tip = this.video.paused ? "\u64AD\u653E" : "\u6682\u505C";
      this.renderTicks();
      const position = this.trackPercent(this.video.currentTime * 1e3), head = this.controls.querySelector(".playhead");
      head.hidden = position < 0 || position > 100;
      head.style.left = position + "%";
      const waiting = this.video.seeking || !this.video.paused && this.video.readyState < 3;
      this.controls.querySelector(".buffering").textContent = waiting ? "\u7F13\u51B2\u4E2D\u2026" : "";
      const buffered = this.controls.querySelector(".buffered");
      buffered.replaceChildren();
      for (let i = 0; i < this.video.buffered.length; i++) {
        const left = Math.max(0, this.trackPercent(this.video.buffered.start(i) * 1e3)), right = Math.min(100, this.trackPercent(this.video.buffered.end(i) * 1e3));
        if (right <= left) continue;
        const span = document.createElement("span");
        span.style.left = left + "%";
        span.style.width = right - left + "%";
        buffered.append(span);
      }
      const time = this.controls.querySelector(".time");
      time.textContent = (position < 0 ? "\u25C0 " : position > 100 ? "\u25B6 " : "") + formatTime(this.video.currentTime * 1e3) + " / " + formatTime(this.video.duration * 1e3);
      time.setAttribute("aria-label", position < 0 ? "\u64AD\u653E\u4F4D\u7F6E\u5728\u89C6\u7A97\u4E4B\u524D" : position > 100 ? "\u64AD\u653E\u4F4D\u7F6E\u5728\u89C6\u7A97\u4E4B\u540E" : "\u64AD\u653E\u4F4D\u7F6E");
    }
    unbind() {
      this.closePeek(true);
      this.feedbackObserver?.disconnect();
      this.visibilityObserver?.disconnect();
      this.restoreNativeFeedback();
      this.intersection?.disconnect();
      this.host?.remove();
      if (this.positionChanged && this.player) this.player.style.setProperty("position", this.position, this.positionPriority);
      for (const timer of [this.collapseTimer, this.dimTimer, this.ackTimer]) clearTimeout(timer);
      this.host = null;
      this.root = null;
      this.toolbar = null;
      this.download = null;
      this.select = null;
      this.binding = null;
    }
    stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      this.unbind();
      document.removeEventListener("visibilitychange", this.onVisibility);
      chrome.runtime.onMessage.removeListener(this.onStop);
      window.removeEventListener("resize", this.onResize);
      delete globalThis.ameowPageTools;
    }
  };
  if (!globalThis.ameowPageTools) globalThis.ameowPageTools = new PageVideoTools();
})();
