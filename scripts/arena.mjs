// Big-screen walkthrough in step-by-step mode: the host advances with Space and we capture every beat.
// Usage: node scripts/arena.mjs [webBase=http://localhost:5173] [phones=8] [lang=en] [width=1920]
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , WEB = "http://localhost:5173", PHONES = "8", LANG = "en", WIDTH = "1920"] = process.argv;
const OUT = "screenshots/arena";
mkdirSync(OUT, { recursive: true });
const NAMES = ["Gab", "Sophie", "Max", "Léa", "Olivier", "Camille", "Jules", "Emma", "Noah", "Zoé", "Félix", "Rose"];
const browser = await chromium.launch();
const errors = [];
const init = `try { localStorage.setItem("21t:lang", JSON.stringify("${LANG}")); localStorage.setItem("21t:sound", "false"); localStorage.removeItem("21t:view"); } catch {}`;
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label} console: ${m.text()}`));
};

const tvCtx = await browser.newContext({ viewport: { width: Number(WIDTH), height: 1080 } });
await tvCtx.addInitScript(init);
const tv = await tvCtx.newPage();
watch(tv, "tv");
await tv.goto(WEB);
await tv.getByRole("button", { name: /Host a table|Ouvrir une table/ }).click();
await tv.waitForURL(/\/host\/[A-Z]{4}/);
const code = tv.url().match(/host\/([A-Z]{4})/)[1];
console.log("room", code);

const phones = [];
for (let i = 0; i < Number(PHONES); i++) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  await ctx.addInitScript(init);
  const p = await ctx.newPage();
  watch(p, `phone${i}`);
  await p.goto(`${WEB}/j/${code}`);
  await p.getByPlaceholder("Alex").fill(NAMES[i % NAMES.length]);
  await p.locator("form .grid button").nth((i * 3) % 16).click();
  await p.getByRole("button", { name: /Take a seat|Prendre place/ }).click();
  phones.push(p);
}
await tv.waitForTimeout(1200);

let shot = 0;
const snapTv = async (name, wait = 0) => {
  if (wait) await tv.waitForTimeout(wait);
  shot++;
  await tv.screenshot({ path: `${OUT}/${String(shot).padStart(2, "0")}-${name}.png` });
};
const next = async () => tv.keyboard.press("Space");

// Step mode, then start.
await tv.keyboard.press("m");
await tv.waitForTimeout(300);
await tv.keyboard.press("Space"); // start
await tv.waitForTimeout(5000); // let the dock auto-hide

async function bet() {
  for (const [i, p] of phones.entries()) {
    const rep = p.getByRole("button", { name: /Repeat|Même mise/ });
    if (await rep.count()) await rep.click();
    else {
      const chips = p.locator('button[aria-label^="+"]');
      await chips.nth(i % 3).click();
      await chips.nth(1).click();
    }
    if (i < phones.length - 1) {
      const lock = p.getByRole("button", { name: /Lock bet|Valider/ });
      if (await lock.count()) await lock.click();
    }
  }
}

async function round(n) {
  await bet();
  await snapTv(`r${n}-betting`, 600);
  const last = phones[phones.length - 1].getByRole("button", { name: /Lock bet|Valider/ });
  if (await last.count()) await last.click();
  await snapTv(`r${n}-all-bets-in`, 500);
  await next(); // no more bets
  await snapTv(`r${n}-no-more-bets`, 350);
  await snapTv(`r${n}-dealing`, 1500);
  await snapTv(`r${n}-dealt`, 3600);
  for (let step = 0; step < 6; step++) {
    const deciding = await tv.getByText(/Hit or stand\?|Tirer ou rester/).count();
    if (!deciding) break;
    for (const [i, p] of phones.entries()) {
      const hit = p.getByRole("button", { name: /^(Hit|Tirer)/ });
      if ((await hit.count()) === 0) continue;
      const choice = (i + step + n) % 3 === 0 ? /^(Stand|Rester)/ : /^(Hit|Tirer)/;
      if (i % 4 === 3) continue; // a few undecided players
      await p.getByRole("button", { name: choice }).click();
    }
    await snapTv(`r${n}-deciding-${step}`, 500);
    await next(); // reveal
    await snapTv(`r${n}-reveal-${step}-a`, 900);
    await snapTv(`r${n}-reveal-${step}-b`, 1700);
    await tv.waitForTimeout(2200);
  }
  // Dealer: flip and draw until payout.
  for (let i = 0; i < 6; i++) {
    const inPayout = await tv.getByText(/Next round|Manche suivante/).count();
    if (inPayout) break;
    await next();
    await snapTv(`r${n}-dealer-${i}-a`, 800);
    await snapTv(`r${n}-dealer-${i}-b`, 1600);
    await tv.waitForTimeout(800);
  }
  await snapTv(`r${n}-payout-a`, 700);
  await snapTv(`r${n}-payout-b`, 1300);
  await snapTv(`r${n}-payout-c`, 4400);
  await next(); // next round
  await tv.waitForTimeout(800);
}

await round(1);
await round(2);
await round(3);

// Table view still works.
await tv.keyboard.press("v");
await snapTv("table-view", 1200);
await tv.keyboard.press("v");
await tv.mouse.move(900, 400);
await snapTv("controls", 500);

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join("\n")}` : "no page errors");
await browser.close();
