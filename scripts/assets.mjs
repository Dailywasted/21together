// Renders PNG icons and the Open Graph share image from HTML (run once; output goes to apps/web/public).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const out = "apps/web/public";
const icon = readFileSync(`${out}/icon.svg`, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#06080b">${icon.replace("<svg", `<svg width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `${out}/icon-${size}.png`, omitBackground: true });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto("http://localhost:5173/");
await page.evaluate(() => {
  try { localStorage.setItem("21t:lang", JSON.stringify("en")); } catch {}
});
await page.goto("http://localhost:5173/");
await page.waitForTimeout(2000);
await page.addStyleTag({ content: "ol{display:none!important} form{display:none!important} header{opacity:.95}" });
await page.screenshot({ path: `${out}/og.png` });
await browser.close();
console.log("assets written");
