import {connectWindowDemo} from './surface-motion.js';
class DesktopDemo extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.abort = new AbortController();
    const listen = (target, name, fn) => target.addEventListener(name, fn, { signal: this.abort.signal });
    if (this.dataset.mode === 'start') this.cleanupWindow = connectWindowDemo(this, this.abort.signal);
    if (this.dataset.mode === 'queue') {
      const trigger = this.querySelector('[data-open-queue]'), panel = this.querySelector('[data-queue-panel]'), full = this.querySelector('[data-queue-full]'), back = this.querySelector('[data-close-queue]');
      const open = value => { full.hidden = value; panel.hidden = !value; trigger.setAttribute('aria-expanded', String(value)); (value ? back : trigger).focus({ preventScroll: true }); };
      listen(trigger, 'click', () => open(true)); listen(back, 'click', () => open(false));
      listen(panel, 'keydown', event => { if (event.key === 'Escape') open(false); });
    }
    if (this.dataset.mode === 'folder') {
      const source = this.querySelector('[data-folder-source]'), target = this.querySelector('[data-folder-target]');
      let selected = false, dragged = false, origin;
      const state = value => { for (const item of this.querySelectorAll('[data-folder-state]')) item.hidden = item.dataset.folderState !== value; };
      const save = () => { selected = false; source.setAttribute('aria-pressed', 'false'); state('saved'); this.querySelector('[data-folder-status]').textContent = this.dataset.lang === 'en' ? 'Example folder updated' : '示例目录已更新'; clearTimeout(this.timer); this.timer = setTimeout(() => state('idle'), 1500); };
      listen(source, 'click', () => { if (dragged) { dragged = false; return; } clearTimeout(this.timer); selected = !selected; source.setAttribute('aria-pressed', String(selected)); state(selected ? 'hover' : 'idle'); });
      listen(target, 'click', () => { if (selected) save(); });
      listen(source, 'pointerdown', event => { if (event.button !== 0) return; source.setPointerCapture(event.pointerId); origin = { x: event.clientX, y: event.clientY }; dragged = false; });
      listen(source, 'pointermove', event => { if (!source.hasPointerCapture(event.pointerId)) return; if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5) dragged = true; if (!dragged) return; const box = target.getBoundingClientRect(); selected = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom; source.setAttribute('aria-pressed', String(selected)); state(selected ? 'hover' : 'idle'); });
      listen(source, 'pointerup', () => { if (dragged && selected) save(); });
      listen(source, 'pointercancel', () => { selected = false; source.setAttribute('aria-pressed', 'false'); state('idle'); });
    }
  }
  disconnectedCallback() { this.abort?.abort(); this.cleanupWindow?.(); clearTimeout(this.timer); this.ready = false; }
}
if (!customElements.get('ameow-desktop-demo')) customElements.define('ameow-desktop-demo', DesktopDemo);
