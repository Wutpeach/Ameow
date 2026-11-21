export function connectFolderDemo(host, listen) {
  const source = host.querySelector('[data-folder-source]');
  const target = host.querySelector('[data-folder-target]');
  const ghost = host.querySelector('[data-folder-ghost]');
  let selected = false, dragged = false, origin = null;
  const state = value => { for (const item of host.querySelectorAll('[data-folder-state]')) item.hidden = item.dataset.folderState !== value; };
  const clearSelection = () => { selected = false; source.setAttribute('aria-pressed', 'false'); };
  const finishPointer = () => {
    const pointerId = origin?.id;
    origin = null; ghost.hidden = true; source.classList.remove('is-dragging');
    if (pointerId !== undefined && source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
  };
  const cancel = () => { finishPointer(); clearSelection(); state('idle'); };
  const save = () => {
    clearSelection(); state('saved');
    host.querySelector('[data-folder-status]').textContent = host.dataset.lang === 'en' ? 'Example folder updated' : '示例目录已更新';
    clearTimeout(host.timer); host.timer = setTimeout(() => state('idle'), 1500);
  };
  listen(source, 'click', event => {
    if (dragged && event.detail>0) { dragged = false; return; }
    dragged = false;
    clearTimeout(host.timer); selected = !selected;
    source.setAttribute('aria-pressed', String(selected)); state(selected ? 'hover' : 'idle');
  });
  listen(target, 'click', () => { if (selected) save(); });
  listen(source, 'pointerdown', event => {
    if (event.button !== 0) return;
    origin = {x:event.clientX,y:event.clientY,id:event.pointerId}; dragged = false;
    source.setPointerCapture(event.pointerId);
  });
  listen(source, 'pointermove', event => {
    if (!origin || !source.hasPointerCapture(event.pointerId)) return;
    if (!dragged && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>5) {
      dragged = true; clearTimeout(host.timer); source.classList.add('is-dragging');
    }
    if (!dragged) return;
    ghost.hidden = false;
    ghost.style.transform = 'translate3d('+(event.clientX+14)+'px,'+(event.clientY+16)+'px,0)';
    const box = target.getBoundingClientRect();
    selected = event.clientX>=box.left && event.clientX<=box.right && event.clientY>=box.top && event.clientY<=box.bottom;
    source.setAttribute('aria-pressed', String(selected)); state(selected ? 'hover' : 'idle');
  });
  listen(source, 'pointerup', () => {
    if (dragged) { if (selected) save(); else { clearSelection(); state('idle'); } }
    finishPointer();
  });
  listen(source, 'pointercancel', cancel);
  listen(source, 'lostpointercapture', () => { if (origin) cancel(); });
  listen(window, 'keydown', event => { if (event.key==='Escape' && (origin || selected)) { event.preventDefault(); dragged = Boolean(origin); cancel(); } });
  listen(window, 'blur', () => { if (origin) cancel(); });
  return () => { finishPointer(); clearTimeout(host.timer); };
}
