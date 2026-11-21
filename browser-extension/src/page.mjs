import { clipRange, formatTime, parseTime } from "./page-core.mjs";
import styles from "./page-ui.css";
import cat from "../../assets/brand/tray/macos/ameow-menu-bar-white.svg";
import scissors from "./icons/scissors.svg";
import markerIn from "./icons/marker-range-in.svg";
import markerOut from "./icons/marker-range-out.svg";

const icons = {
  select: scissors,
  markerIn, markerOut,
  marker: '<svg viewBox="0 0 24 24"><path d="M7 3h10a1 1 0 0 1 1 1v10l-6 6-6-6V4a1 1 0 0 1 1-1Z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path d="M9 9h6v6H9Z"/></svg>',
  whole: '<svg viewBox="0 0 24 24"><path d="M3 8V3h5m8 0h5v5M3 16v5h5m13-5v5h-5"/></svg>',
  download: cat,
  waiting: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14m8-14v14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  precision: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3"/><path class="precision-check" d="m5 8 2 2 4-4"/></svg>',
};
const errors = {
  E_CLIP_UNSUPPORTED: "浏览器连接或桌面版本不支持此功能，请更新同一候选后重试。",
  E_CLIP_RANGE: "请设置有效的入点和出点，出点须晚于入点且不超出视频。",
  E_PAGE_TARGET: "当前播放目标已变化或无法准确对应，请回到单个点播视频。",
  E_PAGE_DISABLED: "页面工具已关闭，请从扩展重新启用。",
  E_NOT_RUNNING: "未连接到 Ameow，请启动桌面应用后重试。",
  E_REQUEST_REJECTED: "Ameow 未受理，请在桌面查看是否已有相同任务或正在退出。",
  E_APP_UPDATE_BUSY: "Ameow 正在更新或退出，请稍后重试。",
};
async function request(action, data = {}) {
  const reply = await chrome.runtime.sendMessage({ action, ...data });
  if (!reply?.ok) throw Error(reply?.error || "E_BRIDGE");
  return reply.value;
}
function shadow(host, html) {
  const root = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet(); sheet.replaceSync(styles); root.adoptedStyleSheets = [sheet];
  // Markup is extension-owned; site strings are never interpreted as HTML.
  root.innerHTML = html;
  return root;
}
function iconButton(root, action, label, icon, className = "icon") {
  const button = document.createElement("button"); button.type = "button"; button.className = className;
  button.dataset.action = action; button.setAttribute("aria-label", label); button.innerHTML = icon; root.append(button);
  return button;
}
function mediaForPage(boundVideo) {
  const selector = location.hostname === "www.youtube.com" ? "#movie_player" : ".bpx-player-container";
  const roots = [...document.querySelectorAll(selector)].filter(el => el.getBoundingClientRect().width > 120);
  if (roots.length !== 1) return null;
  const media = [...roots[0].querySelectorAll("video, bwp-video")].filter(el => el.getBoundingClientRect().width > 120 && el.getBoundingClientRect().height > 60);
  const video = media[0];
  const ready = video && (video.readyState >= 2 || video === boundVideo && video.readyState >= 1);
  return media.length === 1 && ready && Number.isFinite(video.duration) && video.duration > 0 ? { player: roots[0], video } : null;
}
class PageVideoTools {
  constructor() {
    this.binding = null; this.draft = { start_ms: null, end_ms: null }; this.precise = false; this.pending = false; this.stopped = false;
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.onVisibility = () => { if (!document.hidden) void this.refresh(); };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.onResize = () => { if (this.dialog && !this.closing) this.fitPeek(); };
    window.addEventListener("resize", this.onResize);
    this.onStop = message => { if (message.action === "page-stop") this.stop(); };
    chrome.runtime.onMessage.addListener(this.onStop);
    this.schedule();
  }
  schedule() {
    if (this.stopped) return;
    void this.refresh().finally(() => { if (!this.stopped) this.timer = setTimeout(() => this.schedule(), 800); });
  }
  async refresh() {
    if (document.hidden || this.refreshing) return;
    this.refreshing = true;
    try {
      const media = mediaForPage(this.video);
      const target = media ? await request("page-binding") : null;
      if (this.stopped) return;
      if (!media || !target || Math.abs(target.duration - media.video.duration) > .5) { this.unbind(); return; }
      if (this.binding?.key !== target.key || this.video !== media.video || this.player !== media.player) {
        const changed = this.binding?.key !== target.key;
        this.unbind();
        if (changed) { this.draft = { start_ms: null, end_ms: null }; this.precise = false; }
        this.binding = target; this.video = media.video; this.player = media.player; this.mount();
      } else this.binding = target;
    } catch (error) {
      this.unbind();
      if (error.message === "E_PAGE_DISABLED") this.stop();
    } finally { this.refreshing = false; }
  }
  mount() {
    this.host = document.createElement("ameow-page-tools");
    this.host.style.cssText = "position:absolute;top:10px;right:10px;z-index:2147483646;display:block;width:146px;height:28px;pointer-events:none";
    this.position = this.player.style.getPropertyValue("position");
    this.positionPriority = this.player.style.getPropertyPriority("position");
    this.positionChanged = getComputedStyle(this.player).position === "static";
    if (this.positionChanged) this.player.style.setProperty("position", "relative");
    this.player.append(this.host);
    this.root = shadow(this.host, '<div class="toolbar"><div class="capsule"></div><div class="feedback" role="status" aria-live="polite"></div></div>');
    this.toolbar = this.root.querySelector(".toolbar");
    for (const event of ["click", "pointerdown"]) this.toolbar.addEventListener(event, e => e.stopPropagation());
    this.select = iconButton(this.toolbar, "peek", "切片", icons.select + '<span>切片</span>', "select");
    this.select.tabIndex = -1; this.select.inert = true;
    this.download = iconButton(this.toolbar, "download", "下载", '<span class="download-icon">' + cat + '</span><span class="download-label">下载</span>', "download");
    this.select.onclick = () => this.openPeek();
    this.download.onclick = () => void this.submit(null);
    this.toolbar.addEventListener("mouseenter", () => this.wake());
    this.toolbar.addEventListener("mouseleave", () => this.rest());
    this.toolbar.addEventListener("focusin", () => this.wake());
    this.toolbar.addEventListener("focusout", () => queueMicrotask(() => this.rest()));
    this.intersection = new IntersectionObserver(entries => { this.host.style.visibility = entries[0].isIntersecting ? "" : "hidden"; });
    this.intersection.observe(this.player); this.rest();
  }
  held() { return this.toolbar?.matches(":hover") || Boolean(this.root?.activeElement); }
  wake() {
    clearTimeout(this.collapseTimer); clearTimeout(this.dimTimer);
    this.toolbar.removeAttribute("data-dim"); this.toolbar.setAttribute("data-expanded", "");
    this.select.inert = false; this.select.tabIndex = 0;
  }
  rest() {
    if (this.held()) return;
    clearTimeout(this.collapseTimer);
    this.collapseTimer = setTimeout(() => {
      if (this.held()) return;
      this.toolbar?.removeAttribute("data-expanded");
      if (this.select) { this.select.inert = true; this.select.tabIndex = -1; }
      clearTimeout(this.dimTimer);
      this.dimTimer = setTimeout(() => { if (!this.held() && !this.pending) this.toolbar?.setAttribute("data-dim", ""); }, 2000);
    }, 400);
  }
  async submit(clip) {
    if (this.pending || !this.binding) return;
    let range = null;
    try { if (clip !== null) range = clipRange(clip, this.video.duration); }
    catch (error) { this.status(errors[error.message]); return; }
    const bound = this.binding; this.pending = true; this.wake();
    this.toolbar.dataset.status = "pending"; this.download.disabled = true;
    if (this.submitButton) { this.submitButton.disabled = true; this.setSubmitStatus("pending"); }
    if (this.precisionButton) this.precisionButton.disabled = true;
    this.status("");
    try {
      await request("page-submit", { key: bound.key, url: bound.url, clip: range, request_id: crypto.randomUUID() });
      if (this.binding?.key !== bound.key || this.stopped) return;
      this.toolbar.dataset.status = "accepted"; this.download.querySelector(".download-icon").innerHTML = icons.check;
      this.download.setAttribute("aria-label", "已加入队列");
      if (this.submitButton) this.setSubmitStatus("accepted");
      clearTimeout(this.ackTimer); this.ackTimer = setTimeout(() => {
        if (this.download) { this.download.querySelector(".download-icon").innerHTML = cat; this.download.setAttribute("aria-label", "下载"); }
        if (this.toolbar) delete this.toolbar.dataset.status;
        if (this.submitButton) this.setSubmitStatus();
        this.updateFields(); this.rest();
      }, 1600);
    } catch (error) {
      if (this.binding?.key === bound.key) { this.status(errors[error.message] || "连接未确认受理。请检查桌面队列后再重试。"); delete this.toolbar.dataset.status; }
    } finally {
      this.pending = false;
      if (this.download) this.download.disabled = false;
      if (this.submitButton && this.submitButton.dataset.status !== "accepted") this.setSubmitStatus();
      this.updateFields(); this.rest();
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
    this.dialog = document.createElement("dialog"); this.dialog.className = "ameow-peek";
    this.dialog.setAttribute("aria-label", "Ameow 选择片段");
    this.stage = document.createElement("div"); this.stage.className = "ameow-peek-stage";
    this.dialog.append(this.stage); document.body.append(this.dialog);
    const playing = !this.video.paused;
    this.stage.append(this.player); this.player.classList.add("ameow-peek-player"); this.video.controls = false;
    const host = document.createElement("ameow-peek-controls"); this.dialog.append(host);
    this.controls = shadow(host, '<div class="controls"><div class="timeline"><div class="track"><div class="ticks" aria-hidden="true"></div><div class="rail"></div><div class="buffered" aria-hidden="true"></div><div class="band"></div><input type="range" min="0" step="0.001" aria-label="播放位置"><button type="button" class="handle in" role="slider" aria-label="拖动入点" aria-valuemin="0"></button><button type="button" class="handle out" role="slider" aria-label="拖动出点" aria-valuemin="0"></button><div class="playhead" aria-hidden="true"></div><button type="button" class="range-body" role="slider" aria-label="平移选区" aria-valuemin="0" hidden></button><output class="time-bubble" id="marker-time" role="tooltip" hidden></output></div><div class="track-times"><span class="time"></span><span class="buffering" role="status"></span><span class="duration" aria-live="polite"></span></div></div><div class="control-row"><div class="tools"></div><div class="actions"></div></div><div class="time-editor" hidden><label class="field">I<input id="clip-in" inputmode="decimal" placeholder="入点" aria-label="入点时间" autocomplete="off" spellcheck="false"></label><label class="field">O<input id="clip-out" inputmode="decimal" placeholder="出点" aria-label="出点时间" autocomplete="off" spellcheck="false"></label></div><p class="status" role="status" aria-live="polite"></p></div>');
    for (const event of ["click", "pointerdown"]) this.controls.addEventListener(event, e => e.stopPropagation());
    const tools = this.controls.querySelector(".tools"), actions = this.controls.querySelector(".actions");
    const tool = (root, action, label, svg, className = "icon") => {
      const button = iconButton(root, action, label, svg, className); button.dataset.tip = label; return button;
    };
    this.playButton = tool(tools, "play", "播放", icons.play);
    this.playButton.onclick = () => this.togglePlayback();
    this.markerButton = tool(tools, "marker", "添加标记", icons.marker);
    this.markerButton.onclick = () => this.markCurrent();
    const edit = tool(tools, "edit", "编辑选区时间", icons.edit);
    edit.setAttribute("aria-expanded", "false");
    edit.onclick = () => {
      const editor = this.controls.querySelector(".time-editor"); editor.hidden = !editor.hidden;
      edit.setAttribute("aria-expanded", String(!editor.hidden)); this.fitPeek();
      if (!editor.hidden) this.inputs[0].focus({ preventScroll: true }); else edit.focus({ preventScroll: true });
    };
    tool(tools, "view", "聚焦选区", icons.focus, "icon view-toggle");
    this.precisionButton = iconButton(actions, "precise", "精确切分", icons.precision + '<span>精确</span>', "icon precision");
    this.precisionButton.onclick = () => {
      if (this.pending) return;
      this.precise = !this.precise; this.updateFields(); this.status("");
    };
    this.submitButton = tool(actions, "submit", "下载片段", icons.download + '<span aria-hidden="true">下载</span>', "icon submit");
    this.submitButton.onclick = () => void this.submit({ ...this.draft, ...(this.precise ? { precise: true } : {}) });
    this.seek = this.controls.querySelector('.track input'); this.seek.max = this.video.duration;
    this.seek.oninput = () => { this.video.currentTime = Number(this.seek.value); this.updatePlayback(); };
    this.inputs = [this.controls.querySelector("#clip-in"), this.controls.querySelector("#clip-out")];
    this.sliders = [...this.controls.querySelectorAll(".handle")];
    for (const [index, key] of ["start_ms", "end_ms"].entries()) {
      const input = this.inputs[index]; input.value = formatTime(this.draft[key]);
      input.oninput = () => { this.draft[key] = parseTime(input.value); this.updateFields(); this.status(""); };
      input.onchange = () => { if (this.draft[key] !== null) input.value = formatTime(this.draft[key]); };
    }
    this.setupMarkerHandles(); this.setupTimeline();
    this.controls.addEventListener("keydown", e => { if (e.key !== "Escape") e.stopPropagation(); });
    this.handledKeys = new Set();
    this.keydown = e => {
      if (!this.controls) return;
      const path = e.composedPath(), editing = path.some(n => n instanceof Element && n.matches("input:not([type=range]),textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"));
      const interactive = path.some(n => n instanceof Element && n.matches("input,button,select,textarea,a[href],[contenteditable]:not([contenteditable='false']),[role='button'],[role='slider']"));
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); this.closePeek(); }
      else if (!editing && !e.ctrlKey && !e.metaKey && !e.altKey && ["i", "o", "I", "O"].includes(e.key)) {
        this.handledKeys.add(e.code); e.preventDefault(); e.stopImmediatePropagation(); this.setMark(e.key.toLowerCase() === "i" ? "start_ms" : "end_ms");
      } else if (!interactive && e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.handledKeys.add(e.code); e.preventDefault(); e.stopImmediatePropagation(); this.togglePlayback();
      } else if (path.includes(this.controls.host) && [" ", "Enter"].includes(e.key)) {
        // Keep native activation/text entry while stopping the site's capture shortcuts.
        this.handledKeys.add(e.code); e.stopImmediatePropagation();
      }
    };
    this.keyup = e => {
      if (this.handledKeys.delete(e.code)) e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", this.keydown, true); window.addEventListener("keyup", this.keyup, true);
    this.dialog.addEventListener("cancel", e => { e.preventDefault(); this.closePeek(); });
    this.dialog.addEventListener("click", e => { const r = this.dialog.getBoundingClientRect(); if (e.target === this.dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.closePeek(); });
    this.onTime = () => this.updatePlayback();
    for (const event of ["timeupdate", "play", "pause", "seeked", "seeking", "waiting", "playing", "progress", "durationchange"]) this.video.addEventListener(event, this.onTime);
    this.dialog.showModal(); this.fitPeek(); window.dispatchEvent(new Event("resize"));
    this.dialog.setAttribute("data-transition", "");
    const dialog = this.dialog;
    const entry = this.animateStage(from, this.stage.getBoundingClientRect(), this.motion.matches ? 0 : 200);
    if (entry) entry.finished.then(() => { if (this.dialog === dialog && !this.closing) dialog.removeAttribute("data-transition"); }, () => {});
    else dialog.removeAttribute("data-transition");
    host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.motion.matches ? 60 : 180 });
    this.updateFields(); this.updatePlayback(); this.playButton.focus({ preventScroll: true });
    if (playing && this.video.paused) this.togglePlayback();
  }
  setSubmitStatus(state) {
    if (!this.submitButton) return;
    if (state) this.submitButton.dataset.status = state; else delete this.submitButton.dataset.status;
    const label = state === "pending" ? "等待 Ameow 受理…" : state === "accepted" ? "已加入队列" : "下载片段";
    this.submitButton.setAttribute("aria-label", label); this.submitButton.dataset.tip = label;
    this.submitButton.innerHTML = (state === "pending" ? icons.waiting : state === "accepted" ? icons.check : icons.download) + '<span aria-hidden="true">下载</span>';
  }
  markCurrent() {
    if (this.draft.start_ms !== null || this.draft.end_ms !== null) this.clearSelection();
    else this.setDraft(Math.round(this.video.currentTime * 1000), null);
  }
  setDraft(start, end) {
    this.draft = { start_ms: start, end_ms: end }; this.status("");
    if (this.inputs) { this.inputs[0].value = formatTime(start); this.inputs[1].value = formatTime(end); }
    this.updateFields();
  }
  setupMarkerHandles() {
    const keys = ["start_ms", "end_ms"];
    for (const [index, handle] of this.sliders.entries()) {
      handle.innerHTML = icons.marker; handle.setAttribute("aria-describedby", "marker-time");
      const time = () => this.draft[keys[index]];
      const tip = () => { if (time() !== null) this.showTrackTime(time(), (index ? "出点 " : "入点 ") + formatTime(time())); };
      handle.onfocus = tip;
      handle.onpointerenter = handle.onpointermove = e => {
        if (this.draggingTrack) return;
        if (handle.classList.contains("single")) handle.dataset.side = e.clientX < handle.getBoundingClientRect().left + handle.clientWidth / 2 ? "in" : "out";
        tip();
      };
      handle.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); handle.focus({ preventScroll: true }); handle.setPointerCapture(e.pointerId);
        const single = this.draft.start_ms === null || this.draft.end_ms === null;
        const anchor = this.draft.start_ms ?? this.draft.end_ms;
        const rect = handle.getBoundingClientRect();
        const selected = single ? (e.clientX < rect.left + rect.width / 2 ? 0 : 1) : index;
        const from = this.draft[keys[index]], other = this.draft[keys[1 - index]], origin = e.clientX;
        const width = this.controls.querySelector(".track").clientWidth, span = this.timeWindow().span * 1000;
        const show = value => this.showTrackTime(value, (selected ? "出点 " : "入点 ") + formatTime(value));
        handle.dataset.side = selected ? "out" : "in";
        this.draggingTrack = true; handle.dataset.dragging = ""; show(from);
        const drag = event => {
          let value = Math.max(0, Math.min(Math.round(this.video.duration * 1000), Math.round(from + (event.clientX - origin) / width * span)));
          if (single) {
            if (selected === 0 && value < anchor) this.setDraft(value, anchor);
            else if (selected === 1 && value > anchor) this.setDraft(anchor, value);
            else return;
          } else {
            if (other !== null) value = index ? Math.max(other + 1, value) : Math.min(other - 1, value);
            this.setMark(keys[index], value);
          }
          if (this.controls.activeElement !== this.sliders[selected]) this.sliders[selected].focus({ preventScroll: true });
          delete handle.dataset.dragging; this.sliders[selected].dataset.dragging = "";
          show(value);
        };
        const hover = handle.onpointermove;
        handle.onpointermove = drag;
        const finish = event => {
          handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = null;
          handle.onpointermove = hover; this.draggingTrack = false; delete handle.dataset.dragging; delete this.sliders[selected].dataset.dragging;
          if (event.type === "pointerup" && this.controls && !this.closing) {
            const edited = this.draft[keys[selected]] === null ? index : selected;
            this.sliders[edited].focus({ preventScroll: true });
            const value = this.draft[keys[edited]];
            this.showTrackTime(value, (edited ? "出点 " : "入点 ") + formatTime(value));
          } else this.hideTrackTime();
        };
        handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = finish;
      };
      handle.onkeydown = e => {
        const value = time(); if (value === null) return;
        const delta = e.shiftKey ? 1000 : 1;
        let next = { ArrowLeft: value - delta, ArrowDown: value - delta, ArrowRight: value + delta, ArrowUp: value + delta, Home: 0, End: Math.round(this.video.duration * 1000) }[e.key];
        if (next === undefined) return;
        e.preventDefault(); next = Math.max(0, Math.min(Math.round(this.video.duration * 1000), next));
        const other = this.draft[keys[1 - index]];
        if (other !== null) next = index ? Math.max(other + 1, next) : Math.min(other - 1, next);
        this.setMark(keys[index], next); tip();
      };
    }
  }
  setupTimeline() {
    const track = this.controls.querySelector(".track"), body = this.controls.querySelector(".range-body");
    const at = x => Math.max(0, Math.min(this.video.duration * 1000, (this.timeWindow().start + (x - track.getBoundingClientRect().left) / track.clientWidth * this.timeWindow().span) * 1000));
    track.addEventListener("pointermove", e => { if (!this.draggingTrack && !e.target.closest(".handle")) this.showTrackTime(at(e.clientX)); });
    track.addEventListener("pointerleave", () => { if (!this.draggingTrack) this.hideTrackTime(); });
    track.addEventListener("pointerdown", e => {
      if (e.target === track || e.target.matches(".ticks,.ticks span")) { this.video.currentTime = at(e.clientX) / 1000; this.updatePlayback(); }
    });
    const head = this.controls.querySelector(".playhead");
    head.onpointerdown = e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); head.setPointerCapture(e.pointerId); this.seek.focus({ preventScroll: true });
      const seekTo = x => { this.seek.value = at(x) / 1000; this.video.currentTime = Number(this.seek.value); this.updatePlayback(); this.showTrackTime(this.video.currentTime * 1000); };
      this.draggingTrack = true; seekTo(e.clientX);
      head.onpointermove = event => seekTo(event.clientX);
      head.onpointerup = head.onpointercancel = head.onlostpointercapture = () => { head.onpointermove = null; this.draggingTrack = false; this.hideTrackTime(); };
    };
    const shift = (delta, start = this.draft.start_ms, end = this.draft.end_ms) => {
      if (start === null || end === null || end <= start) return;
      delta = Math.max(-start, Math.min(Math.round(this.video.duration * 1000) - end, Math.round(delta)));
      this.draft = { start_ms: start + delta, end_ms: end + delta };
      this.inputs[0].value = formatTime(this.draft.start_ms); this.inputs[1].value = formatTime(this.draft.end_ms);
      this.updateFields(); this.showTrackTime((this.draft.start_ms + this.draft.end_ms) / 2, formatTime(this.draft.start_ms) + " – " + formatTime(this.draft.end_ms));
    };
    body.onpointerdown = e => {
      if (e.button !== 0) return;
      e.preventDefault(); body.focus({ preventScroll: true }); body.setPointerCapture(e.pointerId);
      const start = this.draft.start_ms, end = this.draft.end_ms, origin = e.clientX, width = track.clientWidth;
      this.draggingTrack = true; body.setAttribute("data-dragging", "");
      body.onpointermove = event => { if (Math.abs(event.clientX - origin) >= 3) shift((event.clientX - origin) / width * this.timeWindow().span * 1000, start, end); };
      body.onpointerup = body.onpointercancel = body.onlostpointercapture = () => { body.onpointermove = null; this.draggingTrack = false; body.removeAttribute("data-dragging"); this.hideTrackTime(); };
    };
    body.onkeydown = e => {
      const delta = e.shiftKey ? 1000 : 1;
      const move = { ArrowLeft: -delta, ArrowDown: -delta, ArrowRight: delta, ArrowUp: delta, Home: -this.draft.start_ms, End: this.video.duration * 1000 - this.draft.end_ms }[e.key];
      if (move !== undefined) { e.preventDefault(); shift(move); }
    };
    this.controls.querySelector(".view-toggle").onclick = () => {
      if (this.view) this.view = null;
      else {
        const single = this.draft.start_ms === null || this.draft.end_ms === null;
        const anchor = (this.draft.start_ms ?? this.draft.end_ms) / 1000;
        const length = single ? 0 : (this.draft.end_ms - this.draft.start_ms) / 1000, padding = single ? 4 : Math.max(.75, length * .6);
        const span = Math.min(this.video.duration, length + padding * 2);
        const start = Math.max(0, Math.min(this.video.duration - span, anchor - padding));
        this.view = { start, end: start + span };
      }
      this.hideTrackTime(); this.updateFields(); this.updatePlayback();
    };
    this.seek.addEventListener("input", () => this.showTrackTime(Number(this.seek.value) * 1000));
    this.seek.addEventListener("change", () => this.hideTrackTime());
    this.controls.addEventListener("focusout", () => queueMicrotask(() => this.hideTrackTime()));
    this.renderTicks();
  }
  timeWindow() {
    const start = this.view?.start ?? 0, end = this.view?.end ?? this.video.duration;
    return { start, end, span: end - start };
  }
  trackPercent(ms) { const window = this.timeWindow(); return (ms / 1000 - window.start) / window.span * 100; }
  renderTicks() {
    if (!this.controls) return;
    const track = this.controls.querySelector(".track"), ticks = track.querySelector(".ticks");
    const window = this.timeWindow(), duration = window.span, width = track.clientWidth;
    const target = duration / Math.max(1, Math.floor(width / 62));
    const step = [1,2,5,10,15,30,60,120,300,600,1200,1800,3600,7200,14400,86400].find(n => n >= target) || duration;
    const signature = window.start + ":" + duration + ":" + width + ":" + step;
    if (ticks.dataset.signature === signature) return;
    ticks.dataset.signature = signature; ticks.replaceChildren();
    for (let time = Math.ceil(window.start / step) * step; time <= window.end; time += step) {
      const tick = document.createElement("span"); tick.style.left = this.trackPercent(time * 1000) + "%";
      tick.textContent = formatTime(time * 1000).replace(/\.\d{3}$/, ""); ticks.append(tick);
    }
  }
  showTrackTime(ms, text = formatTime(ms)) {
    const bubble = this.controls?.querySelector(".time-bubble"); if (!bubble) return;
    const duration = this.draft.end_ms - this.draft.start_ms;
    if (this.draggingTrack && duration > 0) text += " · " + formatTime(duration);
    bubble.textContent = text; bubble.hidden = false;
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
      this.showTrackTime(value, (out ? "出点 " : "入点 ") + formatTime(value)); return;
    }
    const bubble = this.controls?.querySelector(".time-bubble"); if (bubble) bubble.hidden = true;
  }
  animateStage(from, to, duration) {
    this.animation?.cancel();
    if (!duration || !to.width || !to.height) return null;
    const dx = from.left - to.left, dy = from.top - to.top;
    this.animation = this.stage.animate([
      { transform: "translate(" + dx + "px," + dy + "px) scale(" + from.width / to.width + "," + from.height / to.height + ")" },
      { transform: "none" },
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
    if (immediate || this.motion.matches || !this.placeholder?.isConnected) { this.restorePeek(); return; }
    this.closing = true; dialog.setAttribute("data-closing", "");
    dialog.setAttribute("data-transition", "");
    const from = this.stage.getBoundingClientRect(); this.animation?.cancel();
    const base = this.stage.getBoundingClientRect(), to = this.placeholder.getBoundingClientRect();
    const transform = r => "translate(" + (r.left - base.left) + "px," + (r.top - base.top) + "px) scale(" + r.width / base.width + "," + r.height / base.height + ")";
    this.animation = this.stage.animate([{ transform: transform(from) }, { transform: transform(to) }], { duration: 110, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    this.animation.finished.then(() => { if (this.dialog === dialog) this.restorePeek(); }, () => {});
  }
  restorePeek() {
    if (!this.dialog) return;
    this.draggingTrack = false; this.playbackRequest = (this.playbackRequest ?? 0) + 1;
    window.removeEventListener("keydown", this.keydown, true); window.removeEventListener("keyup", this.keyup, true);
    const originalConnected = this.placeholder.isConnected;
    this.animation?.cancel(); this.animation = null;
    for (const event of ["timeupdate", "play", "pause", "seeked", "seeking", "waiting", "playing", "progress", "durationchange"]) this.video.removeEventListener(event, this.onTime);
    this.player.classList.remove("ameow-peek-player");
    if (this.savedStyle === null) this.player.removeAttribute("style"); else this.player.setAttribute("style", this.savedStyle);
    this.video.controls = this.savedControls;
    if (!originalConnected) this.video.pause();
    this.placeholder.replaceWith(this.player);
    document.documentElement.style.setProperty("overflow", this.savedOverflow, this.savedOverflowPriority);
    // Peek let the capsule idle; restore its focus target before the dialog returns focus.
    if (originalConnected) this.wake();
    this.dialog.close(); this.dialog.remove();
    this.dialog = null; this.controls = null; this.submitButton = null; this.closing = false;
    window.dispatchEvent(new Event("resize"));
    if (originalConnected) {
      if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
      window.scrollTo(this.savedScroll);
      this.rest();
    }
  }
  togglePlayback() {
    const video = this.video, request = this.playbackRequest = (this.playbackRequest ?? 0) + 1;
    if (video.paused) void video.play().catch(() => {
      if (this.controls && this.video === video && this.playbackRequest === request) this.status("播放未开始，请重试播放。");
    });
    else { video.pause(); this.status(""); }
  }
  setMark(key, value = Math.round(this.video.currentTime * 1000)) {
    this.draft[key] = value; this.status("");
    if (this.inputs) this.inputs[key === "start_ms" ? 0 : 1].value = formatTime(value);
    this.updateFields();
  }
  clearSelection() {
    this.view = null;
    this.draft = { start_ms: null, end_ms: null };
    for (const input of this.inputs) input.value = "";
    this.updateFields(); this.updatePlayback(); this.hideTrackTime(); this.status("");
  }
  updateFields() {
    if (!this.controls) return;
    let valid = false;
    try { clipRange(this.draft, this.video.duration); valid = true; } catch { /* Incomplete drafts are normal. */ }
    this.submitButton.disabled = !valid || this.pending || this.submitButton.dataset.status === "accepted";
    this.precisionButton.disabled = this.pending;
    this.precisionButton.setAttribute("aria-pressed", String(this.precise));
    this.precisionButton.dataset.tip = this.precise
      ? "精确切分，按所选时间处理，可能需要重新编码，耗时更长。"
      : "快速切分，边界可能偏移到附近关键帧。";
    this.precisionButton.setAttribute("aria-description", this.precisionButton.dataset.tip);
    const marked = this.draft.start_ms !== null || this.draft.end_ms !== null;
    this.markerButton.setAttribute("aria-pressed", String(marked));
    this.markerButton.setAttribute("aria-label", marked ? "清除标记" : "添加标记");
    this.markerButton.dataset.tip = marked ? "清除标记" : "添加标记";
    const duration = this.controls.querySelector(".duration");
    duration.textContent = valid ? formatTime(this.draft.end_ms - this.draft.start_ms) : "";
    for (const [index, key] of ["start_ms", "end_ms"].entries()) {
      const ms = this.draft[key] ?? (index ? this.video.duration * 1000 : 0);
      const handle = this.sliders[index];
      const position = this.trackPercent(ms);
      const shape = valid ? (index ? "out" : "in") : "single";
      if (handle.dataset.shape !== shape) {
        handle.dataset.shape = shape;
        handle.innerHTML = valid ? (index ? icons.markerOut : icons.markerIn) : icons.marker;
      }
      handle.style.left = position + "%"; handle.hidden = this.draft[key] === null || position < 0 || position > 100;
      handle.classList.toggle("single", this.draft.start_ms === null || this.draft.end_ms === null);
      handle.setAttribute("aria-valuemax", Math.round(this.video.duration * 1000));
      handle.setAttribute("aria-valuenow", ms);
      handle.setAttribute("aria-valuetext", this.draft[key] === null ? "未设置" : formatTime(ms));
      handle.toggleAttribute("data-unset", this.draft[key] === null);
      const value = this.draft[key];
      const reversed = this.draft.start_ms !== null && this.draft.end_ms !== null && this.draft.end_ms <= this.draft.start_ms;
      this.inputs[index].setAttribute("aria-invalid", this.inputs[index].value && (value === null || value > this.video.duration * 1000 || reversed) ? "true" : "false");
    }
    const toggle = this.controls.querySelector(".view-toggle"); toggle.disabled = this.draft.start_ms === null && this.draft.end_ms === null;
    const label = this.view ? "显示全片" : valid ? "聚焦选区" : "聚焦标记";
    toggle.innerHTML = this.view ? icons.whole : icons.focus; toggle.setAttribute("aria-label", label); toggle.dataset.tip = label; toggle.setAttribute("aria-pressed", String(Boolean(this.view)));
    const window = this.timeWindow(); this.seek.min = window.start; this.seek.max = window.end;
    const band = this.controls.querySelector(".band"); band.style.opacity = valid ? ".22" : "0";
    const body = this.controls.querySelector(".range-body"); body.hidden = !valid;
    this.controls.querySelector(".track").toggleAttribute("data-selection", valid);
    if (valid) {
      const left = Math.max(0, this.trackPercent(this.draft.start_ms)), right = Math.min(100, this.trackPercent(this.draft.end_ms));
      body.hidden = right <= left; band.hidden = right <= left;
      body.style.left = (left + right) / 2 + "%"; body.style.width = (right - left) + "%";
      band.style.left = left + "%"; band.style.right = 100 - right + "%";
      body.setAttribute("aria-valuenow", this.draft.start_ms); body.setAttribute("aria-valuemax", this.video.duration * 1000 - (this.draft.end_ms - this.draft.start_ms));
      body.setAttribute("aria-valuetext", formatTime(this.draft.start_ms) + " – " + formatTime(this.draft.end_ms));
    } else band.hidden = false;
    this.renderTicks();
  }

  updatePlayback() {
    if (!this.controls) return;
    if (this.controls.activeElement !== this.seek) this.seek.value = this.video.currentTime;
    this.playButton.innerHTML = this.video.paused ? icons.play : icons.pause;
    this.playButton.setAttribute("aria-label", this.video.paused ? "播放" : "暂停"); this.playButton.dataset.tip = this.video.paused ? "播放" : "暂停";
    this.renderTicks();
    const position = this.trackPercent(this.video.currentTime * 1000), head = this.controls.querySelector(".playhead");
    head.hidden = position < 0 || position > 100; head.style.left = position + "%";
    const waiting = this.video.seeking || !this.video.paused && this.video.readyState < 3;
    this.controls.querySelector(".buffering").textContent = waiting ? "缓冲中…" : "";
    const buffered = this.controls.querySelector(".buffered"); buffered.replaceChildren();
    for (let i = 0; i < this.video.buffered.length; i++) {
      const left = Math.max(0, this.trackPercent(this.video.buffered.start(i) * 1000)), right = Math.min(100, this.trackPercent(this.video.buffered.end(i) * 1000));
      if (right <= left) continue;
      const span = document.createElement("span"); span.style.left = left + "%";
      span.style.width = (right - left) + "%"; buffered.append(span);
    }
    const time = this.controls.querySelector(".time");
    time.textContent = (position < 0 ? "◀ " : position > 100 ? "▶ " : "") + formatTime(this.video.currentTime * 1000) + " / " + formatTime(this.video.duration * 1000);
    time.setAttribute("aria-label", position < 0 ? "播放位置在视窗之前" : position > 100 ? "播放位置在视窗之后" : "播放位置");
  }
  unbind() {
    this.closePeek(true);
    this.intersection?.disconnect(); this.host?.remove();
    if (this.positionChanged && this.player) this.player.style.setProperty("position", this.position, this.positionPriority);
    for (const timer of [this.collapseTimer, this.dimTimer, this.ackTimer]) clearTimeout(timer);
    this.host = null; this.root = null; this.toolbar = null; this.download = null; this.select = null;
    this.binding = null;
  }
  stop() {
    this.stopped = true; clearTimeout(this.timer); this.unbind();
    document.removeEventListener("visibilitychange", this.onVisibility); chrome.runtime.onMessage.removeListener(this.onStop);
    window.removeEventListener("resize", this.onResize);
    delete globalThis.ameowPageTools;
  }
}
if (!globalThis.ameowPageTools) globalThis.ameowPageTools = new PageVideoTools();
