// Reindeer Race bonus walkthrough: host forces a bonus (B), phones pick, screenshots every stage.
// Usage: node scripts/race.mjs [webBase] [phones=6] [lang=en]
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [, , WEB = "http://localhost:5173", PHONES = "6", LANG = "en"] = process.argv;
const OUT = "screenshots/race";
mkdirSync(OUT, { recursive: true });
const NAMES = ["Alex", "Sophie", "Max", "Léa", "Olivier", "Camille", "Jules", "Emma"];
const browser = await chromium.launch();
const errors = [];
const init = `try { localStorage.setItem("21t:lang", JSON.stringify("${LANG}")); localStorage.setItem("21t:sound", "false"); localStorage.removeItem("21t:view"); } catch {}`;
const watch = (page, l) => {
  page.on("pageerror", (e) => errors.push(`${l}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${l} console: ${m.text()}`));
};
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await tvCtx.addInitScript(init);
const tv = await tvCtx.newPage();
watch(tv, "tv");
await tv.goto(WEB);
await tv.getByRole("button", { name: /Host a table|Ouvrir une table/ }).click();
await tv.waitForURL(/\/host\/[A-Z]{4}/);
const code = tv.url().match(/host\/([A-Z]{4})/)[1];
const phones = [];
for (let i = 0; i < Number(PHONES); i++) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  await ctx.addInitScript(init);
  const p = await ctx.newPage();
  watch(p, `phone${i}`);
  await p.goto(`${WEB}/j/${code}`);
  await p.getByPlaceholder("Alex").fill(NAMES[i]);
  await p.locator("form .grid button").nth((i * 3) % 16).click();
  await p.getByRole("button", { name: /Take a seat|Prendre place/ }).click();
  phones.push(p);
}
await tv.waitForTimeout(1000);
await tv.keyboard.press("Space"); // start (auto mode)
await tv.waitForTimeout(5000);
await tv.keyboard.press("b"); // host-triggered bonus
let n = 0;
const shot = async (name, wait = 0) => {
  if (wait) await tv.waitForTimeout(wait);
  await tv.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` });
};
await shot("intro", 1600);
await tv.waitForTimeout(4200);
// picking
for (const [i, p] of phones.entries()) {
  if (i === phones.length - 1) continue; // one undecided → random pick
  await p.getByRole("button", { name: /🦌/ }).nth(i % 6).click().catch(() => {});
  await p.getByRole("button").filter({ hasText: /\+\d/ }).nth((i * 2) % 6).click();
}
await phones[0].screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-phone-picking.png` });
await shot("picking", 300);
await tv.waitForFunction(() => /FINISH/.test(document.body.innerText), null, { timeout: 25000 });
await shot("race-start", 1200);
await shot("race-mid", 5000);
await phones[0].screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-phone-racing.png` });
await shot("race-late", 5500);
await shot("race-finish", 3200);
await shot("results", 4200);
await phones[0].screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-phone-result.png` });
await shot("back-to-table", 9000);
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join("\n")}` : "no page errors");
await browser.close();
