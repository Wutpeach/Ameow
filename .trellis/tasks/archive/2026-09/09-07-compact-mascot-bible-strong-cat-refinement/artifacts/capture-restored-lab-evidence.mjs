import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const outputDir = resolve(import.meta.dirname, process.env.COMPACT_LAB_OUTPUT_DIR ?? "restored-lab-captures");
const baseUrl = process.env.COMPACT_LAB_URL ?? "http://127.0.0.1:4174/lab.html";
const scenarios = [
  "compact-neutral",
  "compact-pointer",
  "compact-surprised",
  "compact-curious",
  "compact-playful",
];

const captureBoundedPointer = async (page, stage, path) => {
  const neutralEyes = await page.locator("[data-compact-mascot] g path").evaluateAll((paths) => paths.map((node) => node.getAttribute("d")));
  const stageBox = await stage.boundingBox();
  if (stageBox === null) throw new Error("Compact pointer capture surface was unavailable");
  await page.mouse.move(stageBox.x + stageBox.width * 0.75, stageBox.y + stageBox.height * 0.25);
  await page.waitForTimeout(50);
  const pointerEyes = await page.locator("[data-compact-mascot] g path").evaluateAll((paths) => paths.map((node) => node.getAttribute("d")));
  if (JSON.stringify(pointerEyes) === JSON.stringify(neutralEyes)) throw new Error("Bounded pointer sample remained neutral");
  await stage.screenshot({ path });
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ["black", "white"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}?theme=${theme}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "紧凑", exact: true }).click();
    await page.getByRole("button", { name: "1×", exact: true }).click();

    for (const scenario of scenarios) {
      await page.locator(`[data-lab-compact-preset="${scenario}"]`).click();
      const stage = page.locator("[data-lab-compact-stage]");
      await stage.screenshot({ path: resolve(outputDir, `${theme}-${scenario}-1x.png`) });

      if (scenario === "compact-pointer") {
        await captureBoundedPointer(page, stage, resolve(outputDir, `${theme}-${scenario}-bounded-pointer-1x.png`));
      }

      await page.getByRole("button", { name: "3×", exact: true }).click();
      await stage.screenshot({ path: resolve(outputDir, `${theme}-${scenario}-3x.png`) });
      if (scenario === "compact-pointer") {
        await captureBoundedPointer(page, stage, resolve(outputDir, `${theme}-${scenario}-bounded-pointer-3x.png`));
      }
      await page.getByRole("button", { name: "1×", exact: true }).click();
    }
    await page.close();
  }
} finally {
  await browser.close();
}
