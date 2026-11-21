import { Sessions, within } from './core.mjs';
import { PageTools } from './page-background.mjs';
const pages = new PageTools(chrome);
const sessions = new Sessions(chrome);
let work = Promise.resolve();
const enqueue = action => { const next = work.then(action); work = next.catch(() => {}); return next; };
async function reconcile() {
  await enqueue(() => pages.reconcile());
  await chrome.alarms.create('ameow-sync', { periodInMinutes: 1 });
  return enqueue(() => sessions.sync());
}
chrome.runtime.onInstalled.addListener(() => { void reconcile(); });
chrome.runtime.onStartup.addListener(() => { void reconcile(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'ameow-sync') void reconcile(); });
chrome.permissions.onRemoved.addListener(() => { void reconcile(); });
chrome.permissions.onAdded.addListener(() => { void enqueue(() => pages.reconcile()); });
let changes;
const changedDomains = new Set();
chrome.cookies.onChanged.addListener(change => {
  changedDomains.add(change.cookie.domain.replace(/^\./, ''));
  clearTimeout(changes);
  changes = setTimeout(() => {
    const domains = [...changedDomains]; changedDomains.clear();
    void enqueue(async () => {
      const { grants } = await sessions.state();
      for (const site of Object.keys(grants)) {
        if (domains.some(domain => within(domain, site))) await sessions.sync(site);
      }
    });
  }, 500);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && sender.tab && ["page-binding", "page-submit"].includes(message.action)) {
    const action = message.action === "page-binding" ? () => pages.binding(sender) : () => pages.submit(message, sender);
    action().then(value => respond({ ok: true, value }), error => respond({ ok: false, error: /^E_[A-Z_]+$/.test(error.message) ? error.message : "E_BRIDGE" }));
    return true;
  }
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  const action = {
    "pages-status": async () => ({ enabled: await pages.enabled(message.host) }),
    "pages-set": () => pages.set(message.host, message.enabled, message.tab_id),
    status: () => sessions.status(message.site),
    authorize: () => sessions.authorize(message.site, message.replaces, message.source_name),
    sync: () => sessions.sync(message.site),
    revoke: () => sessions.revoke(message.site),
  }[message.action];
  if (!action) return false;
  enqueue(action).then(value => respond({ ok: true, value }), () => respond({ ok: false, error: 'E_BRIDGE' }));
  return true;
});
// Recreate an alarm lost during an extension update or browser restart.
void chrome.alarms.get('ameow-sync').then(alarm => { if (!alarm) void reconcile(); });
