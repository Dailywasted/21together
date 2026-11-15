// End-to-end checks: reload keeps your seat, offline/online reconnects, host kick works.
// Usage: node scripts/e2e.mjs [webBase=http://localhost:5173]
import { chromium, devices } from "@playwright/test";

const WEB = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch();
const init = `try { localStorage.setItem("21t:lang", JSON.stringify("en")); localStorage.setItem("21t:sound", "false"); } catch {}`;
let failures = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}

const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await tvCtx.addInitScript(init);
const tv = await tvCtx.newPage();
await tv.goto(WEB);
await tv.getByRole("button", { name: /Host a table/ }).click();
await tv.waitForURL(/\/host\/[A-Z]{4}/);
const code = tv.url().match(/host\/([A-Z]{4})/)[1];

const phoneCtx = await browser.newContext({ ...devices["Pixel 7"] });
await phoneCtx.addInitScript(init);
const phone = await phoneCtx.newPage();
await phone.goto(`${WEB}/j/${code}`);
await phone.getByPlaceholder("Alex").fill("Tester");
await phone.getByRole("button", { name: /Take a seat/ }).click();
await phone.getByText(/#\d+ · Code/).waitFor({ timeout: 10000 });
check("phone joins and gets a seat", true);

await tv.getByText("Tester").first().waitFor({ timeout: 5000 });
check("TV shows the new player", true);

// Reload keeps the seat (no join form)
await phone.reload();
const back = await phone.getByText(/#\d+ · Code/).waitFor({ timeout: 10000 }).then(() => true, () => false);
check("reload reclaims the same seat", back);
check("no join form after reload", (await phone.getByRole("button", { name: /Take a seat/ }).count()) === 0);

// Start + place a bet, then drop offline mid-betting and come back
await tv.getByRole("button", { name: /Start the game/ }).first().click();
await phone.locator('button[aria-label="+25"]').waitFor({ timeout: 8000 });
await phone.locator('button[aria-label="+25"]').click();
await phoneCtx.setOffline(true);
await phone.waitForTimeout(2500);
await phoneCtx.setOffline(false);
const reconnected = await phone
  .waitForFunction(() => !document.body.innerText.includes("Reconnecting"), null, { timeout: 15000 })
  .then(() => true, () => false);
check("reconnects after going offline", reconnected);
const lockBtn = phone.getByRole("button", { name: /Lock bet/ });
if (await lockBtn.count()) await lockBtn.click();
const dealt = await tv.getByText(/Hit or stand\?|Dealer's turn|Payout/).first().waitFor({ timeout: 25000 }).then(() => true, () => false);
check("round deals after reconnect", dealt);

// Host kicks the player
await tv.keyboard.press("p");
await tv.getByRole("button", { name: /^Kick$/ }).first().click();
await tv.keyboard.press("Escape");
const kicked = await phone.getByText(/removed from the table/).waitFor({ timeout: 8000 }).then(() => true, () => false);
check("kicked player sees the notice", kicked);

// Unknown room
const p2 = await phoneCtx.newPage();
await p2.goto(`${WEB}/j/ZZZZ`);
const nf = await p2.getByText(/Table not found/).waitFor({ timeout: 10000 }).then(() => true, () => false);
check("unknown room shows not-found", nf);

await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
