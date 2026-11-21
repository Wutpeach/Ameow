import {connectWindowDemo} from './surface-motion.js';
import {connectFolderDemo} from './folder-demo.js';
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
    if (this.dataset.mode === 'folder') this.cleanupFolder = connectFolderDemo(this, listen);
  }
  disconnectedCallback() { this.abort?.abort(); this.cleanupWindow?.(); this.cleanupFolder?.(); clearTimeout(this.timer); this.ready = false; }
}
if (!customElements.get('ameow-desktop-demo')) customElements.define('ameow-desktop-demo', DesktopDemo);
