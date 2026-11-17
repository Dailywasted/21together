// Raw iPhone screenshots for the README preview (join screen + hit/stand), framed afterwards by scripts/frame.py.
// Usage: node scripts/readme-shots.mjs [webBase=http://localhost:5173]
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , WEB = "http://localhost:5173"] = process.argv;
const OUT = "screenshots/readme";
mkdirSync(OUT, { recursive: true });
const NAMES = ["Alex", "Sophie", "Max", "Léa"];
const init = `try { localStorage.setItem("21t:lang", JSON.stringify("en")); localStorage.setItem("21t:sound", "false"); } catch {}`;
// iPhone 14 Pro is 393x852; leave room for the status bar (54) and home indicator (38) drawn by the frame.
const iphone = { ...devices["iPhone 14 Pro"], viewport: { width: 393, height: 760 } };

const browser = await chromium.launch();
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await tvCtx.addInitScript(init);
const tv = await tvCtx.newPage();
await tv.goto(WEB);
await tv.getByRole("button", { name: /Host a table/ }).click();
await tv.waitForURL(/\/host\/[A-Z]{4}/);
const code = tv.url().match(/host\/([A-Z]{4})/)[1];

const phones = [];
for (let i = 0; i < NAMES.length; i++) {
  const ctx = await browser.newContext(iphone);
  await ctx.addInitScript(init);
  const p = await ctx.newPage();
  await p.goto(`${WEB}/j/${code}`);
  await p.getByPlaceholder("Alex").fill(NAMES[i]);
  await p.locator("form .grid button").nth((i * 3) % 16).click();
  if (i === 0) {
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/iphone-join.png` });
  }
  await p.getByRole("button", { name: /Take a seat/ }).click();
  phones.push(p);
}

await tv.getByRole("button", { name: /Start the game/ }).first().click();
let shot = false;
for (let round = 0; round < 6 && !shot; round++) {
  await phones[0].getByRole("button", { name: /Lock bet/ }).waitFor({ timeout: 30000 });
  for (const p of phones) {
    await p.locator('button[aria-label^="+"]').nth(1).click();
    await p.locator('button[aria-label^="+"]').nth(0).click();
    await p.getByRole("button", { name: /Lock bet/ }).click();
  }
  // Wait for the first decision (no decision if dealer or player has blackjack).
  const hit = phones[0].getByRole("button", { name: /^Hit/ });
  try {
    await hit.waitFor({ timeout: 9000 });
    await phones[0].waitForTimeout(1200);
    await phones[0].screenshot({ path: `${OUT}/iphone-decide.png` });
    shot = true;
  } catch {
    console.log("no decision this round, retrying");
  }
  if (!shot) await tv.keyboard.press("n");
}
console.log(shot ? "ok" : "FAILED to capture a decision");
await browser.close();
