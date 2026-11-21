import { HOST } from "./core.mjs";
import { PAGE_ORIGINS, pageHost, canonicalTarget, clipRange } from "./page-core.mjs";

// This function runs in the page world. Return only current work/time evidence.
function readPlayer() {
  const visible = el => el && el.getBoundingClientRect().width > 120 && el.getBoundingClientRect().height > 60;
  if (location.hostname === "www.youtube.com") {
    const root = document.querySelector("#movie_player"), videos = [...(root?.querySelectorAll("video") || [])].filter(visible);
    const data = root?.getVideoData?.();
    return { page_url: location.href, id: data?.video_id, live: Boolean(data?.isLive || data?.isWindowedLive),
      ad: Boolean(root?.classList.contains("ad-showing")), duration: videos[0]?.duration, count: videos.length };
  }
  const root = document.querySelector(".bpx-player-container"), videos = [...(root?.querySelectorAll("video, bwp-video") || [])].filter(visible);
  const params = window.player?.getManifest?.();
  const id = params?.bvid, cid = Number(params?.cid);
  const part = Number(params?.p);
  return { page_url: location.href, id, cid, aid: Number(params?.aid), part, live: false, ad: Boolean(window.player?.hasValidAdv?.()),
    duration: videos[0]?.duration, count: videos.length, bound: videos[0] === window.player?.mediaElement?.() };
}
export class PageTools {
  constructor(api) { this.api = api; }
  async state() { return (await this.api.storage.local.get("page_tools")).page_tools || {}; }
  async enabled(host) { return Boolean((await this.state())[host] !== false && PAGE_ORIGINS[host] && await this.api.permissions.contains({ origins: [PAGE_ORIGINS[host]] })); }
  async reconcile() {
    const state = await this.state();
    const registered = await this.api.scripting.getRegisteredContentScripts();
    for (const [host, origin] of Object.entries(PAGE_ORIGINS)) {
      const id = "ameow-page-" + host.replaceAll(".", "-");
      const enabled = state[host] !== false && await this.api.permissions.contains({ origins: [origin] });
      const exists = registered.some(s => s.id === id);
      if (!enabled && exists) await this.api.scripting.unregisterContentScripts({ ids: [id] });
      if (enabled && !exists) await this.api.scripting.registerContentScripts([{ id, matches: [origin], js: ["page.js"], css: ["page.css"], runAt: "document_idle", allFrames: false }]);
      if (!enabled && exists) {
        const tabs = await this.api.tabs.query({ url: [origin] });
        for (const tab of tabs) if (tab.id != null) await this.api.tabs.sendMessage(tab.id, { action: "page-stop" }).catch(() => {});
      }
      if (enabled) {
        const tabs = await this.api.tabs.query({ url: [origin] });
        for (const tab of tabs) if (tab.id != null) {
          try {
            const [probe] = await this.api.scripting.executeScript({ target: { tabId: tab.id }, func: () => Boolean(globalThis.ameowPageTools) });
            if (!probe?.result) {
              await this.api.scripting.insertCSS({ target: { tabId: tab.id }, files: ["page.css"] });
              await this.api.scripting.executeScript({ target: { tabId: tab.id }, files: ["page.js"] });
            }
          } catch { /* A tab may have closed or navigated during reconciliation. */ }
        }
      }
    }
  }
  async set(host, enabled) {
    if (!Object.hasOwn(PAGE_ORIGINS, host)) throw Error("E_PAGE_TARGET");
    if (enabled && !await this.api.permissions.contains({ origins: [PAGE_ORIGINS[host]] })) throw Error("E_PERMISSION");
    const state = await this.state(); state[host] = enabled;
    await this.api.storage.local.set({ page_tools: state });
    await this.reconcile();
    if (!enabled) {
      const tabs = await this.api.tabs.query({ url: [PAGE_ORIGINS[host]] });
      for (const tab of tabs) if (tab.id != null) await this.api.tabs.sendMessage(tab.id, { action: "page-stop" }).catch(() => {});
    }
    return { enabled };
  }
  async binding(sender) {
    const host = pageHost(sender.url);
    if (!host || sender.frameId !== 0 || !sender.tab?.id || !await this.enabled(host)) throw Error("E_PAGE_DISABLED");
    const [result] = await this.api.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [0] }, world: "MAIN", func: readPlayer });
    if (host === "www.bilibili.com" && !result?.result?.bound) return null;
    // A content script's sender URL can retain its document URL after SPA navigation.
    if (pageHost(result?.result?.page_url) !== host) return null;
    return canonicalTarget(result.result.page_url, result.result);
  }
  async submit(message, sender) {
    const target = await this.binding(sender);
    if (!target || target.key !== message.key || target.url !== message.url) throw Error("E_PAGE_TARGET");
    const clip = message.clip === null ? null : clipRange(message.clip, target.duration);
    if (!/^[a-f0-9-]{36}$/.test(message.request_id || "")) throw Error("E_INVALID_REQUEST");
    const ping = await this.api.runtime.sendNativeMessage(HOST, { version: 1, request_id: crypto.randomUUID(), operation: { operation: "ping" } });
    if (!ping?.ok || !ping.bridge?.capabilities?.includes("page_submit_v1") || clip && !ping.bridge.capabilities.includes("clip_v1")) throw Error("E_CLIP_UNSUPPORTED");
    if (clip?.precise && !ping.bridge.capabilities.includes("precise_clip_v1")) throw Error("E_CLIP_UNSUPPORTED");
    const reply = await this.api.runtime.sendNativeMessage(HOST, { version: 1, request_id: message.request_id, operation: { operation: "submit", url: target.url, clip } });
    if (reply?.version !== 1 || reply.request_id !== message.request_id || !reply.ok || typeof reply.accepted?.task_id !== "string") throw Error(reply?.error || "E_BRIDGE");
    return reply.accepted;
  }
}
