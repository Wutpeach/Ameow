import {frameTheme} from './product-frames.js';
class ProductClip extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true; this.progress = 0; this.playing = false; this.visible = false;
    this.manualUntil = 0; this.active = new Set(); this.state = {time:0,start:null,end:null};
    this.motion = matchMedia('(prefers-reduced-motion:reduce)'); this.abort = new AbortController();
    const listen = (el,name,fn) => el.addEventListener(name,fn,{signal:this.abort.signal});
    this.cleanup = frameTheme(this,'clip');
    listen(this,'pointerdown',event => { if (event.target.closest('[data-step]')) { this.active.add('outer:pointer:'+event.pointerId); this.manual(); } });
    listen(this,'keydown',event => { if (event.target.closest('[data-step]') && ['Enter',' '].includes(event.key)) { this.active.add('outer:key:'+event.code); this.manual(); } });
    for (const name of ['pointerup','pointercancel','keyup']) listen(window,name,event => {
      const id = name==='keyup' ? 'outer:key:'+event.code : 'outer:pointer:'+event.pointerId;
      if (this.active.delete(id)) this.manual();
    });
    listen(window,'blur',() => { if (this.active.size) { this.active.clear(); this.manual(); } });
    for (const step of this.querySelectorAll('[data-step]')) listen(step,'click',() => {
      this.manual(); this.at(Number(step.dataset.step));
      this.querySelector('[data-status]').textContent = step.querySelector('span').textContent;
    });
    listen(window,'message',event => {
      if (event.source!==this.querySelector('iframe').contentWindow || event.origin!==location.origin) return;
      const data = event.data;
      if (data?.kind==='manual-clip-ready') this.send();
      if (data?.kind==='manual-clip-interact') {
        if (data.phase==='start') this.active.add('frame:'+data.id);
        if (data.phase==='end') this.active.delete('frame:'+data.id);
        this.manual();
      }
      if (data?.kind==='manual-clip-state') {
        this.state = data.state;
        this.progress = this.state.start!==null && this.state.end>this.state.start ? 8 : this.state.start!==null || this.state.end!==null ? 3 : 0;
        this.render();
      }
    });
    listen(document,'visibilitychange',() => this.reconcile());
    listen(this.motion,'change',() => { if (this.motion.matches) { this.pause(); this.at(8); } this.reconcile(); });
    this.observer = new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; this.reconcile(); },{threshold:.1});
    this.observer.observe(this);
    this.at(this.motion.matches ? 8 : 0);
  }
  send() { this.querySelector('iframe').contentWindow?.postMessage({kind:'manual-clip-set',state:this.state},location.origin); }
  at(seconds) {
    this.progress = Math.min(12,Math.max(0,seconds)); const p = this.progress;
    this.state = {time:p<2.5 ? (this.motion.matches ? 1 : Math.min(1,p/1.5)) : 1,start:p<2.5 || p>=10.5 ? null : 1000,end:p>=5 && p<10.5 ? (this.motion.matches ? 4000 : Math.round(1000+Math.min(1,(p-5)/3)*3000)) : null};
    this.send(); this.render();
  }
  manual() { this.manualUntil = performance.now()+5000; this.pause(); this.reconcile(); }
  reconcile() {
    clearTimeout(this.resumeTimer);
    const available = this.visible && !document.hidden && !this.motion.matches && !this.active.size;
    const wait = this.manualUntil-performance.now();
    if (!available || wait>0) {
      this.pause();
      if (available && wait>0) this.resumeTimer = setTimeout(() => this.reconcile(),wait);
      return;
    }
    this.play();
  }
  pause() { this.playing = false; cancelAnimationFrame(this.frame); }
  play() {
    if (this.playing) return;
    this.playing = true; let previous = performance.now();
    const tick = now => {
      if (!this.playing) return;
      this.at((this.progress+(now-previous)/1000)%12); previous = now;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  render() {
    const bounds = [0,2.5,5,10.5,12];
    for (const [i,step] of [...this.querySelectorAll('[data-step]')].entries()) {
      step.setAttribute('aria-current',String(this.progress>=bounds[i] && this.progress<bounds[i+1]));
      step.style.setProperty('--stage-fill',Math.max(0,Math.min(1,(this.progress-bounds[i])/(bounds[i+1]-bounds[i])))*100+'%');
    }
  }
  disconnectedCallback() { this.pause(); clearTimeout(this.resumeTimer); this.abort?.abort(); this.observer?.disconnect(); this.cleanup?.(); this.ready = false; }
}
if (!customElements.get('ameow-clip-demo')) customElements.define('ameow-clip-demo',ProductClip);
