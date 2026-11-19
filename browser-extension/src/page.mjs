import { clipRange, formatTime, parseTime } from "./page-core.mjs";
import styles from "./page-ui.css";
import cat from "../../assets/brand/tray/macos/ameow-menu-bar-white.svg";

const icons = {
  select: '<svg viewBox="0 0 24 24"><path d="M8 5H5v14h3m8-14h3v14h-3M9 12h6m-3-3v6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14m8-14v14"/></svg>',
  mark: '<svg viewBox="0 0 24 24"><path d="M12 4v16M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
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
  button.dataset.action = action; button.setAttribute("aria-label", label); button.title = label; button.innerHTML = icon; root.append(button);
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
    this.binding = null; this.draft = { start_ms: null, end_ms: null }; this.pending = false; this.stopped = false;
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
        if (changed) this.draft = { start_ms: null, end_ms: null };
        this.binding = target; this.video = media.video; this.player = media.player; this.mount();
      } else this.binding = target;
    } catch (error) {
      this.unbind();
      if (error.message === "E_PAGE_DISABLED") this.stop();
    } finally { this.refreshing = false; }
  }
  mount() {
    this.host = document.createElement("ameow-page-tools");
    this.host.style.cssText = "position:absolute;top:12px;right:12px;z-index:2147483646;display:block;width:80px;height:40px;pointer-events:none";
    this.position = this.player.style.getPropertyValue("position");
    this.positionPriority = this.player.style.getPropertyPriority("position");
    this.positionChanged = getComputedStyle(this.player).position === "static";
    if (this.positionChanged) this.player.style.setProperty("position", "relative");
    this.player.append(this.host);
    this.root = shadow(this.host, '<div class="toolbar"><div class="capsule"></div><div class="feedback" role="status" aria-live="polite"></div></div>');
    this.toolbar = this.root.querySelector(".toolbar");
    for (const event of ["click", "pointerdown"]) this.toolbar.addEventListener(event, e => e.stopPropagation());
    this.select = iconButton(this.toolbar, "peek", "选择片段", icons.select, "select");
    this.select.tabIndex = -1; this.select.inert = true;
    this.download = iconButton(this.toolbar, "download", "下载整段", cat, "download");
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
    if (this.submitButton) { this.submitButton.disabled = true; this.submitButton.textContent = "等待 Ameow 受理…"; }
    this.status("");
    try {
      await request("page-submit", { key: bound.key, url: bound.url, clip: range, request_id: crypto.randomUUID() });
      if (this.binding?.key !== bound.key || this.stopped) return;
      this.toolbar.dataset.status = "accepted"; this.download.innerHTML = icons.check;
      this.download.setAttribute("aria-label", "已加入队列"); this.download.title = "已加入队列";
      if (this.submitButton) { this.submitButton.dataset.status = "accepted"; this.submitButton.textContent = "已加入队列"; }
      clearTimeout(this.ackTimer); this.ackTimer = setTimeout(() => {
        if (this.download) { this.download.innerHTML = cat; this.download.setAttribute("aria-label", "下载整段"); this.download.title = "下载整段"; }
        if (this.toolbar) delete this.toolbar.dataset.status;
        if (this.submitButton) { delete this.submitButton.dataset.status; this.submitButton.textContent = "下载片段"; }
        this.updateFields(); this.rest();
      }, 1600);
    } catch (error) {
      if (this.binding?.key === bound.key) { this.status(errors[error.message] || "连接未确认受理。请检查桌面队列后再重试。"); delete this.toolbar.dataset.status; }
    } finally {
      this.pending = false;
      if (this.download) this.download.disabled = false;
      if (this.submitButton && this.submitButton.dataset.status !== "accepted") this.submitButton.textContent = "下载片段";
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
    this.controls = shadow(host, '<div class="controls"><div class="heading"><h2>选择片段</h2></div><div class="playback"><div class="timeline"><div class="band" hidden></div><input type="range" min="0" step="0.001" aria-label="播放位置"></div><span class="time"></span></div><div class="fields"><div class="selection"><div class="field"><label for="clip-in">I</label><input id="clip-in" inputmode="decimal" placeholder="入点" aria-label="入点时间" autocomplete="off"></div><div class="field"><label for="clip-out">O</label><input id="clip-out" inputmode="decimal" placeholder="出点" aria-label="出点时间" autocomplete="off"></div><span class="duration" aria-live="polite">设置入点和出点</span></div><div class="trim"><label>I <input type="range" min="0" step="0.001" aria-label="拖动入点"></label><label>O <input type="range" min="0" step="0.001" aria-label="拖动出点"></label></div></div><div class="actions"><button type="button" data-action="clear">清除选区</button><button type="button" class="submit" data-action="submit" disabled>下载片段</button></div><p class="note">按 I / O 标记，空格播放。按关键帧附近快速粗切。</p><p class="status" role="status" aria-live="polite"></p></div>');
    iconButton(this.controls.querySelector(".heading"), "close", "关闭预览", icons.close).onclick = () => this.closePeek();
    this.playButton = iconButton(this.controls.querySelector(".playback"), "play", "播放", icons.play);
    this.controls.querySelector(".playback").prepend(this.playButton);
    this.playButton.onclick = () => this.togglePlayback();
    this.seek = this.controls.querySelector(".timeline input"); this.seek.max = this.video.duration;
    this.seek.oninput = () => { this.video.currentTime = Number(this.seek.value); this.updatePlayback(); };
    this.inputs = [this.controls.querySelector("#clip-in"), this.controls.querySelector("#clip-out")];
    this.sliders = [...this.controls.querySelectorAll(".trim input")];
    for (const [index, key] of ["start_ms", "end_ms"].entries()) {
      const input = this.inputs[index], slider = this.sliders[index]; slider.max = this.video.duration;
      input.value = formatTime(this.draft[key]);
      input.oninput = () => { this.draft[key] = parseTime(input.value); this.updateFields(); };
      input.onchange = () => { if (this.draft[key] !== null) input.value = formatTime(this.draft[key]); };
      slider.oninput = () => { this.setMark(key, Math.round(Number(slider.value) * 1000)); this.video.currentTime = Number(slider.value); };
      iconButton(input.parentNode, "mark-" + key, index ? "将当前位置设为出点（O）" : "将当前位置设为入点（I）", icons.mark).onclick = () => this.setMark(key);
    }
    this.submitButton = this.controls.querySelector('[data-action="submit"]');
    this.submitButton.onclick = () => void this.submit({ ...this.draft });
    this.controls.querySelector('[data-action="clear"]').onclick = () => this.clearSelection();
    this.controls.addEventListener("keydown", e => { if (e.key !== "Escape") e.stopPropagation(); });
    this.keydown = e => {
      const interactive = e.composedPath().some(n => n instanceof Element && n.matches("input,button,select,textarea,a[href],[contenteditable='true'],[role='button']"));
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); this.closePeek(); }
      else if (!interactive && ["i", "o", "I", "O", " "].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === " ") this.togglePlayback(); else this.setMark(e.key.toLowerCase() === "i" ? "start_ms" : "end_ms");
      }
    };
    this.dialog.addEventListener("keydown", this.keydown, true);
    this.dialog.addEventListener("cancel", e => { e.preventDefault(); this.closePeek(); });
    this.dialog.addEventListener("click", e => { const r = this.dialog.getBoundingClientRect(); if (e.target === this.dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) this.closePeek(); });
    this.onTime = () => this.updatePlayback();
    for (const event of ["timeupdate", "play", "pause", "seeked", "durationchange"]) this.video.addEventListener(event, this.onTime);
    this.dialog.showModal(); this.fitPeek(); window.dispatchEvent(new Event("resize"));
    this.dialog.setAttribute("data-transition", "");
    const dialog = this.dialog;
    const entry = this.animateStage(from, this.stage.getBoundingClientRect(), this.motion.matches ? 0 : 200);
    if (entry) entry.finished.then(() => { if (this.dialog === dialog && !this.closing) dialog.removeAttribute("data-transition"); }, () => {});
    else dialog.removeAttribute("data-transition");
    host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: this.motion.matches ? 60 : 180 });
    this.updateFields(); this.updatePlayback(); this.playButton.focus({ preventScroll: true });
    if (playing && this.video.paused) void this.video.play().catch(() => this.status("播放未恢复，请按播放继续。"));
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
    const originalConnected = this.placeholder.isConnected;
    this.animation?.cancel(); this.animation = null;
    for (const event of ["timeupdate", "play", "pause", "seeked", "durationchange"]) this.video.removeEventListener(event, this.onTime);
    this.player.classList.remove("ameow-peek-player");
    if (this.savedStyle === null) this.player.removeAttribute("style"); else this.player.setAttribute("style", this.savedStyle);
    this.video.controls = this.savedControls;
    if (!originalConnected) this.video.pause();
    this.placeholder.replaceWith(this.player);
    document.documentElement.style.setProperty("overflow", this.savedOverflow, this.savedOverflowPriority);
    this.dialog.close(); this.dialog.remove();
    this.dialog = null; this.controls = null; this.submitButton = null; this.closing = false;
    window.dispatchEvent(new Event("resize"));
    if (originalConnected) {
      if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
      window.scrollTo(this.savedScroll);
    }
  }
  togglePlayback() {
    if (this.video.paused) void this.video.play().catch(() => this.status("播放未开始，请重试播放。"));
    else this.video.pause();
  }
  setMark(key, value = Math.round(this.video.currentTime * 1000)) {
    this.draft[key] = value;
    if (this.inputs) this.inputs[key === "start_ms" ? 0 : 1].value = formatTime(value);
    this.updateFields();
  }
  clearSelection() {
    this.draft = { start_ms: null, end_ms: null };
    for (const input of this.inputs) input.value = "";
    this.updateFields(); this.status("");
  }
  updateFields() {
    if (!this.controls) return;
    let valid = false;
    try { clipRange(this.draft, this.video.duration); valid = true; } catch { /* Incomplete drafts are normal. */ }
    this.submitButton.disabled = !valid || this.pending || this.submitButton.dataset.status === "accepted";
    const duration = this.controls.querySelector(".duration");
    duration.textContent = valid ? formatTime(this.draft.end_ms - this.draft.start_ms) : "设置有效的入点和出点";
    for (const [index, key] of ["start_ms", "end_ms"].entries()) {
      this.sliders[index].value = (this.draft[key] ?? (index ? this.video.duration * 1000 : 0)) / 1000;
      const value = this.draft[key];
      const reversed = this.draft.start_ms !== null && this.draft.end_ms !== null && this.draft.end_ms <= this.draft.start_ms;
      this.inputs[index].setAttribute("aria-invalid", this.inputs[index].value && (value === null || value > this.video.duration * 1000 || reversed) ? "true" : "false");
    }
    const band = this.controls.querySelector(".band"); band.hidden = false; band.style.opacity = valid ? ".22" : "0";
    if (valid) { band.style.left = this.draft.start_ms / (this.video.duration * 10) + "%"; band.style.right = 100 - this.draft.end_ms / (this.video.duration * 10) + "%"; }
  }
  updatePlayback() {
    if (!this.controls) return;
    if (this.controls.activeElement !== this.seek) this.seek.value = this.video.currentTime;
    this.playButton.innerHTML = this.video.paused ? icons.play : icons.pause;
    this.playButton.setAttribute("aria-label", this.video.paused ? "播放" : "暂停");
    this.playButton.title = this.video.paused ? "播放" : "暂停";
    this.controls.querySelector(".time").textContent = formatTime(this.video.currentTime * 1000) + " / " + formatTime(this.video.duration * 1000);
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
