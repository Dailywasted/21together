// Visual walkthrough: drives a real TV host + N phones through rounds and screenshots every phase.
// Usage: node scripts/shots.mjs [webBase=http://localhost:5173] [phones=4] [lang=en]
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , WEB = "http://localhost:5173", PHONES = "4", LANG = "en"] = process.argv;
const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });
const NAMES = ["Gab", "Sophie", "Max", "Léa", "Olivier", "Camille", "Jules", "Emma", "Noah", "Zoé", "Félix", "Rose", "Theo"];

const browser = await chromium.launch();
const errors = [];
const init = `try { localStorage.setItem("21t:lang", JSON.stringify("${LANG}")); localStorage.setItem("21t:sound", "false"); } catch {}`;

function watch(page, label) {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label} console: ${m.text()}`));
}

// Landing (desktop + phone)
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await desk.addInitScript(init);
const landing = await desk.newPage();
watch(landing, "landing");
await landing.goto(WEB);
await landing.waitForTimeout(1500);
await landing.screenshot({ path: `${OUT}/01-landing-desktop.png` });

// TV
const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await tvCtx.addInitScript(init);
const tv = await tvCtx.newPage();
watch(tv, "tv");
await tv.goto(WEB);
await tv.getByRole("button", { name: /Host a table|Ouvrir une table/ }).click();
await tv.waitForURL(/\/host\/[A-Z]{4}/);
const code = tv.url().match(/host\/([A-Z]{4})/)[1];
console.log("room", code);
await tv.waitForTimeout(1500);
await tv.screenshot({ path: `${OUT}/02-tv-lobby-empty.png` });

// Phones
const phones = [];
for (let i = 0; i < Number(PHONES); i++) {
  const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"], browserName: undefined });
  await ctx.addInitScript(init);
  const p = await ctx.newPage();
  watch(p, `phone${i}`);
  await p.goto(`${WEB}/j/${code}`);
  await p.getByPlaceholder("Alex").fill(NAMES[i % NAMES.length]);
  await p.locator("form .grid button").nth((i * 3) % 16).click();
  if (i === 0) await p.screenshot({ path: `${OUT}/03-phone-join.png` });
  await p.getByRole("button", { name: /Take a seat|Prendre place/ }).click();
  phones.push(p);
}
await phones[0].waitForTimeout(1200);
await phones[0].screenshot({ path: `${OUT}/04-phone-lobby.png` });
await tv.waitForTimeout(800);
await tv.screenshot({ path: `${OUT}/05-tv-lobby-players.png` });

// Start
await tv.getByRole("button", { name: /Start the game|Lancer la partie/ }).first().click();
await tv.waitForTimeout(1500);
// Bets: tap chips
for (const [i, p] of phones.entries()) {
  const chips = p.locator('button[aria-label^="+"]');
  await chips.nth(i % 3).click();
  await chips.nth(1).click();
  if (i === 0) await p.screenshot({ path: `${OUT}/06-phone-betting.png` });
}
await tv.waitForTimeout(500);
await tv.screenshot({ path: `${OUT}/07-tv-betting.png` });
for (const p of phones) await p.getByRole("button", { name: /Lock bet|Valider/ }).click();

async function playRound(n) {
  // Wait for decisions
  await tv.waitForTimeout(3600);
  await tv.screenshot({ path: `${OUT}/r${n}-08-tv-dealt.png` });
  let step = 0;
  for (let guard = 0; guard < 8; guard++) {
    const deciding = await phones[0].getByRole("button", { name: /^(Hit|Tirer)/ }).count();
    const anyDeciding = (await Promise.all(phones.map((p) => p.getByRole("button", { name: /^(Hit|Tirer)/ }).count()))).some((c) => c > 0);
    if (!anyDeciding) break;
    if (step === 0 && deciding) await phones[0].screenshot({ path: `${OUT}/r${n}-09-phone-deciding.png` });
    for (const [i, p] of phones.entries()) {
      const hit = p.getByRole("button", { name: /^(Hit|Tirer)/ });
      if ((await hit.count()) === 0) continue;
      const choice = (i + step) % 3 === 0 ? /^(Stand|Rester)/ : /^(Hit|Tirer)/;
      await p.getByRole("button", { name: choice }).click();
    }
    if (step === 0) {
      await tv.waitForTimeout(150);
      await tv.screenshot({ path: `${OUT}/r${n}-10-tv-locked.png` });
    }
    await tv.waitForTimeout(900);
    await tv.screenshot({ path: `${OUT}/r${n}-11-tv-drawing-${step}.png` });
    await tv.waitForTimeout(1800);
    step++;
  }
  await tv.waitForTimeout(2200);
  await tv.screenshot({ path: `${OUT}/r${n}-12-tv-dealer.png` });
  // payout
  await tv.waitForFunction(() => document.body.innerText.match(/Payout|Paiement|🏅/), null, { timeout: 15000 }).catch(() => {});
  await tv.waitForTimeout(700);
  await tv.screenshot({ path: `${OUT}/r${n}-13-tv-payout.png` });
  await phones[0].screenshot({ path: `${OUT}/r${n}-14-phone-result.png` });
  await phones[1].screenshot({ path: `${OUT}/r${n}-14b-phone-result.png` });
}

await playRound(1);
// Round 2: bets via repeat
await tv.waitForTimeout(6500);
for (const p of phones) {
  const rep = p.getByRole("button", { name: /Repeat|Même mise/ });
  if (await rep.count()) await rep.click();
  else await p.locator('button[aria-label^="+"]').nth(0).click();
  const lock = p.getByRole("button", { name: /Lock bet|Valider/ });
  if (await lock.count()) await lock.click();
}
await playRound(2);

// Tabs on phone
await tv.waitForTimeout(1000);
for (const [name, file] of [
  [/Stats/, "15-phone-stats"],
  [/History|Historique/, "16-phone-history"],
  [/Ranking|Classement/, "17-phone-ranking"],
]) {
  await phones[0].getByRole("button", { name }).last().click();
  await phones[0].waitForTimeout(700);
  await phones[0].screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
}
await phones[0].getByRole("button", { name: /Play|Jouer/ }).last().click();

// Host controls + awards
await tv.mouse.move(900, 500);
await tv.waitForTimeout(400);
await tv.screenshot({ path: `${OUT}/18-tv-controls.png` });
await tv.keyboard.press("p");
await tv.waitForTimeout(500);
await tv.screenshot({ path: `${OUT}/19-tv-players-modal.png` });
await tv.keyboard.press("Escape");
await tv.getByRole("button", { name: /End the night|Terminer la soirée/ }).click();
await tv.getByRole("button", { name: /^(Yes|Oui)$/ }).click();
await tv.waitForTimeout(3500);
await tv.screenshot({ path: `${OUT}/20-tv-awards.png` });

console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join("\n")}` : "no page errors");
await browser.close();
