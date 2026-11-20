// Own anonymous profile; no extension, cookies, registration, or desktop instance.
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const root = resolve(process.argv[2]);
await mkdir(root, { recursive: true });
const browser = await chromium.launchPersistentContext(join(root, "profile"), {
  executablePath: "D:/Ameow-handoffs/issue24-browser-validation/chrome-for-testing/158.0.8127.36/chrome-win64/chrome.exe",
  headless: true, viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: join(root, "video"), size: { width: 1280, height: 900 } },
  args: ["--no-first-run", "--no-default-browser-check"],
});
const results = [];
try {
  for (const [site, url, selector] of [
    ["youtube", "https://www.youtube.com/watch?v=jNQXAC9IVRw", "#movie_player video"],
    ["bilibili", "https://www.bilibili.com/video/BV17x411w7KC/", ".bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video"],
  ]) {
    const page = await browser.newPage();
    const result = { site, url };
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      result.status = response.status();
      await page.locator(selector).first().waitFor({ timeout: 25000 });
      await page.waitForFunction(selector => { const v = document.querySelector(selector); return v && v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0 && v.currentSrc; }, selector, { timeout: 25000 });
      await page.waitForTimeout(2000);
      await page.locator(selector).first().evaluate(v => v.pause());
      result.before = await page.locator(selector).first().evaluate(video => {
        const player = video.closest("#movie_player, .bpx-player-container");
        window.ameowProbe = { video, player, parent: player.parentNode, next: player.nextSibling, style: player.getAttribute("style"), src: video.currentSrc, time: video.currentTime };
        const dialog = document.createElement("dialog");
        dialog.style.cssText = "width:80vw;height:70vh;border:0;padding:0;background:#000";
        document.body.append(dialog); dialog.showModal();
        dialog.append(player);
        player.style.cssText = "width:100%;height:100%;position:relative";
        return { duration: video.duration, srcKind: video.currentSrc.split(":")[0], time: video.currentTime, paused: video.paused };
      });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: join(root, site + "-peek.png") });
      result.after = await page.evaluate(() => {
        const p = window.ameowProbe;
        const sameNode = p.video === p.player.querySelector("video, bwp-video");
        const sameSource = p.src === p.video.currentSrc;
        const dialog = p.player.parentNode;
        p.parent.insertBefore(p.player, p.next);
        if (p.style === null) p.player.removeAttribute("style"); else p.player.setAttribute("style", p.style);
        dialog.close(); dialog.remove();
        return { sameNode, sameSource, restored: p.player.parentNode === p.parent, duration: p.video.duration, time: p.video.currentTime };
      });
      result.pass = result.after.sameNode && result.after.sameSource && result.after.restored;
    } catch (e) { result.error = e.message; await page.screenshot({ path: join(root, site + "-failure.png") }).catch(() => {}); result.text = (await page.locator("body").innerText()).slice(0, 1500); }
    results.push(result);
    await page.close();
  }
} finally { await browser.close(); await writeFile(join(root, "probe.json"), JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results, null, 2));
