// Exercise the remaining I/O controls instead of the removed time editor.
export async function markRange(page, start = 1.25, end = 4.75) {
  const video = page.locator(".ameow-peek video, .ameow-peek bwp-video");
  const time = await video.evaluate(video => video.currentTime);
  await page.locator("ameow-peek-controls [data-action=marker]").focus();
  for (const [key, value] of [["KeyI", start], ["KeyO", end]]) {
    await video.evaluate((video, value) => { video.currentTime = value; }, value);
    await page.keyboard.press(key);
  }
  await video.evaluate((video, time) => { video.currentTime = time; video.dispatchEvent(new Event("timeupdate")); }, time);
}

export async function readDraft(page) {
  return page.locator("ameow-peek-controls").evaluate(host => {
    const value = selector => {
      const handle = host.shadowRoot.querySelector(selector);
      return handle.hasAttribute("data-unset") ? null : Number(handle.getAttribute("aria-valuenow"));
    };
    return { start_ms: value(".handle.in"), end_ms: value(".handle.out") };
  });
}
