// Bot simulator / load test: creates (or joins) a room and plays rounds with N bots.
// Usage: node scripts/bots.mjs [apiBase=http://localhost:8787] [bots=4] [rounds=3] [roomCode] [hostToken]
const [, , apiBase = "http://localhost:8787", botsArg = "4", roundsArg = "3", codeArg, tokenArg] = process.argv;
const BOTS = Number(botsArg);
const ROUNDS = Number(roundsArg);
const wsBase = apiBase.replace(/^http/, "ws");
const NAMES = ["Ava", "Léo", "Noah", "Zoé", "Liam", "Emma", "Jade", "Hugo", "Mia", "Nate", "Rose", "Theo", "Lou", "Sam"];
const AVATARS = ["🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐲", "🦉", "🐺", "🐻", "🐵", "🦈", "🐧"];

function rid() {
  return "bot-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}

function connect(code, onMsg) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws/${code}`);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", (e) => reject(e));
    ws.addEventListener("message", (ev) => onMsg(JSON.parse(ev.data)));
  });
}

let code = codeArg;
let hostToken = tokenArg;
if (!code) {
  const res = await fetch(`${apiBase}/api/rooms`, { method: "POST" });
  ({ code, hostToken } = await res.json());
}
console.log(`room ${code}`);

let lastSnap = null;
let errors = 0;
const host = await connect(code, (m) => {
  if (m.t === "state") lastSnap = m.s;
  if (m.t === "error") console.log("host error", m.code);
});
host.send(JSON.stringify({ t: "hello", role: "host", deviceId: rid(), hostToken }));

const bots = [];
for (let i = 0; i < BOTS; i++) {
  const bot = { name: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : ""), me: null, s: null, ws: null, lastRound: -1, lastStep: -1 };
  bot.ws = await connect(code, (m) => {
    if (m.t === "error") {
      errors++;
      if (!["not_betting", "not_deciding", "bad_decision"].includes(m.code)) console.log(bot.name, "error", m.code);
    }
    if (m.t !== "state") return;
    bot.s = m.s;
    bot.me = m.me;
    act(bot);
  });
  bot.ws.send(JSON.stringify({ t: "hello", role: "player", deviceId: rid() }));
  bot.ws.send(JSON.stringify({ t: "join", name: bot.name, avatar: AVATARS[i % AVATARS.length] }));
  bots.push(bot);
}

function act(bot) {
  const s = bot.s;
  if (!s || !bot.me) return;
  const p = s.players.find((x) => x.id === bot.me.playerId);
  if (!p) return;
  if (s.phase === "betting" && p.seat !== null && !p.betLocked && bot.lastRound !== s.roundNo && p.chips >= s.rules.minBet) {
    bot.lastRound = s.roundNo;
    const amount = Math.min(p.chips, s.rules.minBet * (1 + Math.floor(Math.random() * 10)));
    setTimeout(() => bot.ws.send(JSON.stringify({ t: "bet", amount, lock: true })), 100 + Math.random() * 1500);
  }
  if (s.phase === "deciding" && p.hand && p.hand.status === "active" && !bot.me.pending && bot.lastStep !== `${s.roundNo}:${s.step}`) {
    bot.lastStep = `${s.roundNo}:${s.step}`;
    const t = p.hand.total;
    let action = t < 12 ? "hit" : t >= 17 ? "stand" : Math.random() < 0.5 ? "hit" : "stand";
    if (bot.me.canDouble && (t === 10 || t === 11) && Math.random() < 0.6) action = "double";
    setTimeout(() => bot.ws.send(JSON.stringify({ t: "decide", action })), 200 + Math.random() * 2500);
  }
}

await new Promise((r) => setTimeout(r, 500));
host.send(JSON.stringify({ t: "host", cmd: { c: "start" } }));

const started = Date.now();
await new Promise((resolve) => {
  const iv = setInterval(() => {
    if (lastSnap && lastSnap.roundNo >= ROUNDS && lastSnap.phase === "betting") {
      clearInterval(iv);
      resolve();
    }
    if (Date.now() - started > 60_000 * ROUNDS) {
      clearInterval(iv);
      console.log("TIMEOUT");
      resolve();
    }
  }, 250);
});

const s = lastSnap;
console.log(`played ${s.history.length} rounds in ${((Date.now() - started) / 1000).toFixed(1)}s, ${errors} soft errors`);
for (const h of s.history.slice().reverse()) {
  console.log(
    `#${h.no} shared=${h.shared.join(" ")} dealer=${h.dealer.join(" ")} (${h.dealerTotal}) → ` +
      h.results.map((r) => `${r.name}:${r.total}/${r.outcome}/${r.net >= 0 ? "+" : ""}${r.net}`).join(" "),
  );
}
console.log("leaderboard:", s.leaderboard.map((l) => `${l.name} ${l.chips}`).join(", "));
const chipSum = s.players.reduce((a, p) => a + p.chips, 0);
console.log("rail:", s.rail.length, "seated:", s.seats.filter(Boolean).length, "chipSum:", chipSum);
for (const b of bots) b.ws.close();
host.close();
process.exit(s.history.length >= ROUNDS ? 0 : 1);
