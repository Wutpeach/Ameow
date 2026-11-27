export const REQUIRED_PAGE_HOSTS = ["www.youtube.com", "www.bilibili.com"];
export const PAGE_ORIGINS = {
  "www.youtube.com": "https://www.youtube.com/*",
  "www.bilibili.com": "https://www.bilibili.com/*",
  "www.xiaohongshu.com": "https://www.xiaohongshu.com/*",
};
export function pageHost(value) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && Object.hasOwn(PAGE_ORIGINS, u.hostname) ? u.hostname : null; } catch { return null; }
}
export function clipRange(value, duration) {
  if (!value || Object.keys(value).some(k => !["start_ms", "end_ms", "precise"].includes(k))
    || Object.hasOwn(value, "precise") && typeof value.precise !== "boolean"
    || !Number.isSafeInteger(value.start_ms) || !Number.isSafeInteger(value.end_ms)
    || value.start_ms < 0 || value.end_ms <= value.start_ms
    || Number.isFinite(duration) && value.end_ms > Math.round(duration * 1000)) throw Error("E_CLIP_RANGE");
  return { start_ms: value.start_ms, end_ms: value.end_ms, ...(value.precise ? { precise: true } : {}) };
}
export function formatTime(ms) {
  if (ms === null || !Number.isFinite(ms)) return "";
  ms = Math.max(0, Math.round(ms));
  const hours = Math.floor(ms / 3600000), mins = Math.floor(ms / 60000) % 60;
  return (hours ? hours + ":" + String(mins).padStart(2, "0") : String(mins)) + ":" + String(Math.floor(ms / 1000) % 60).padStart(2, "0") + "." + String(ms % 1000).padStart(3, "0");
}
export function canonicalTarget(url, evidence) {
  const host = pageHost(url), u = new URL(url);
  if (!host || !evidence || evidence.ad || evidence.live || !Number.isFinite(evidence.duration) || evidence.duration <= 0 || evidence.count !== 1) return null;
  if (host === "www.youtube.com") {
    const id = u.searchParams.get("v");
    if (u.pathname !== "/watch" || u.searchParams.getAll("v").length !== 1 || !/^[\w-]{11}$/.test(id || "") || id !== evidence.id) return null;
    return { key: `youtube:${id}`, url: `https://www.youtube.com/watch?v=${id}`, duration: evidence.duration };
  }
  if (host === "www.xiaohongshu.com") {
    const match = u.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/);
    if (u.port || !match || match[1] !== evidence.id || match[1] !== evidence.currentId || evidence.noteType !== "video" || !evidence.bound) return null;
    u.hash = "";
    return { key: "xiaohongshu:" + match[1], url: u.href, duration: evidence.duration };
  }
  const match = u.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10}|av\d+)\/?$/);
  const part = Number(u.searchParams.get("p") || 1);
  if (!match || u.searchParams.getAll("p").length > 1 || !Number.isSafeInteger(part) || part < 1
    || part !== evidence.part || !/^BV[A-Za-z0-9]{10}$/.test(evidence.id || "")
    || match[1] !== evidence.id && match[1] !== `av${evidence.aid}`) return null;
  return { key: `bilibili:${evidence.id}:${part}:${evidence.cid}`, url: `https://www.bilibili.com/video/${evidence.id}/?p=${part}`, duration: evidence.duration };
}
